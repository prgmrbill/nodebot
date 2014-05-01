/**
 * squire - will perform different actions based on whether a hostmask
 * is in the friend/foe groups. Uses admin plugin to perform said actions
 * and uses the commands/kick messages etc from there as well.
 *
 * check for friends/foes on:
 * - join
 * - message
 *
 */
"use strict";

var parser     = require('../../lib/messageParser');
var aee        = require('../../lib/argusEventEmitter');
var admin      = require('../../plugins/admin');
var argus      = require('../../lib/argus');
var db         = require('../../lib/db');
var when       = require('when');
var minimatch  = require('minimatch');
var _          = require('underscore');
var squire     = {
    cfg: {
        channels        : [],
        nicks           : {
            
        }
    }
};

squire.reload = function (options) {
    squire.loadConfig(options);
    squire.scan();
};

squire.loadConfig      = function (options) {
    squire.client      = options.client;
    squire.argus       = options.argus;
    squire.wholeConfig = options.config;
    squire.channels    = options.config.channels;
    
    squire.getHostmasks()
          .then(function (hostmasks) {
                squire.cfg.friends = _.filter(hostmasks, function (s) {
                    return s.isFriend === 1;
                });
                
                squire.cfg.foes = _.filter(hostmasks, function (s) {
                    return s.isFriend === 0;
                });
                
                squire.cfg = _.extend(squire.cfg, squire.wholeConfig.plugins.squire);
          })
          .catch(function (e) {
                console.log('squire.getHostmasks error: ');
                console.log(e.stack);
          });
};

squire.init = function (options) {
    var client       = options.client;
    squire.loadConfig(options);
    
    options.ame.on('actionableMessage', function (info) {
        var targetUpgradeable = squire.isTargetUpgradeable(info);
        
        if (targetUpgradeable) {
            squire.performAction(info);
        }
    });
    
    options.ame.on('actionableMessageAddressingBot', function (info) {
        var isAdmin = admin.userIsAdmin({
            userInfo: {
                user: info.info.user,
                host: info.info.host
            }
        });
        
        if (isAdmin) {
            switch (info.command) {
                case 'af':
                    squire.processAddFriendCommand(info, options);
                break;
                
                case 'rf':
                    squire.processRemoveFriendCommand(info, options);
                break;
                
                case 'if':
                    squire.processIsFriendCommand(info, options);
                break;
                
                case 'scan':
                    squire.scan();
                    client.say(info.channel, 'scanning!');
                break;
            }
        }
    });
    
    aee.on('hostmaskUpdated', function (info) {
        for (var j = 0; j < info.channels.length; j++) {
            var targetUpgradeable = squire.isTargetUpgradeable(info.channels[j]);
            
            if (targetUpgradeable) {
                squire.performAction(_.extend(info, {
                    channel: info.channels[j]
                }));
            }
        }
    });
    
    aee.on('adminHostmaskBanned', function (info) {
        client.send('MODE', info.channel, '-b', info.hostmask);
    });
    
    aee.on('allHostmasksProcessed', function (info) {
        squire.scan();
    });
    
    client.addListener('join', function (nick, message) {
        squire.scan();
    });
};

squire.processIsFriendCommand = function (info, options) {
    var errorCB = function (e) {
        var errMsg = 'error lol';
        var msg    = e ? [errMsg, e].join(': ') : errMsg;
        
        squire.client.say(info.channel, msg);
    };
    
    var target = info.words[2];
    var user   = squire.argus.getNick(target);
    
    if (user && user.hostmask) {
        var isFriend = squire.isFriend(user.hostmask);
        var msg      = isFriend ? 'yes' : 'no';
        
        squire.client.say(info.channel, msg);
        
    } else {
        errorCB();
    }
};

squire.processAddFriendCommand = function (info, options) {
    var errorCB = function (e) {
        var errMsg = 'error lol';
        var msg    = e ? [errMsg, e].join(': ') : errMsg;
        
        squire.client.say(info.channel, msg);
    };
    
    var target = info.words[2];
    var user   = squire.argus.getNick(target);
    
    if (user && user.hostmask) {
        squire.addFriend(_.extend(info, {
            hostmask: user.hostmask,
            nick    : target
        }), options)
        .then(function () {
            squire.reload(options);
        })
        .catch(function (e) {
            errorCB(e);
        });
    } else {
        errorCB();
    }    
};

squire.processRemoveFriendCommand = function (info, options) {
    var errorCB = function (e) {
        var errMsg = 'error lol';
        var msg    = e ? [errMsg, e].join(': ') : errMsg;
        
        squire.client.say(info.channel, msg);
    };
    
    var target = info.words[2];
    var user   = squire.argus.getNick(target);
    
    if (user && user.hostmask) {
        squire.removeFriend(user.hostmask)
        .then(function () {
            squire.reload(options);
        })
        .catch(function (e) {
            errorCB(e);
        });
    } else {
        errorCB();
    }    
};

squire.scan = function () {
    var channels = squire.argus.channels || [];
    var cur;
    
    console.log('Squire: scanning @ ' + new Date());
    
    for (var j = 0; j < channels.length; j++) {
        cur = channels[j];
        
        var targetUpgradeable = squire.isTargetUpgradeable(cur);
        
        if (targetUpgradeable) {
            squire.performAction(cur);
        } else {
            console.log(cur, ' not upgradeable');
        }
    }
};

squire.isTargetUpgradeable  = function (info) {
    var targetHasModeAlready = false;
    var hasMask              = false;
    var botHasOps            = false;
    
    var user = _.find(squire.cfg.friends, function (s) {
        return s.hostmask === info.hostmask;
    });
    
    // If they don't already have mode
    targetHasModeAlready = argus.hasMode(_.extend(info, {
        mode: user ? user.mode : '+'
    }));
    
    // And this item has a hostmask
    hasMask             = typeof info.hostmask === 'string';
    
    // And the bot has ops in that channel
    botHasOps           = argus.botHasOpsInChannel(info.channel, squire.wholeConfig.nick);
    
    //console.log('targetHasModeAlready: ', targetHasModeAlready);
    //console.log('hasMask: ', hasMask);
    //console.log('botHasOps: ', botHasOps);
    
    return hasMask && botHasOps && !targetHasModeAlready;
};

squire.isBotInChannel = function (channel) {
    var botInChannel = squire.client.chans && Object.keys(squire.client.chans).indexOf(channel) !== -1;
    
    return botInChannel;
};

squire.performAction = function (info) {
    var user = _.find(squire.cfg.friends, function (s) {
        return s.hostmask === info.hostmask;
    });
    
    var mode = user ? user.mode : false;
    
    if (mode) {
        if (squire.isFriend(info.hostmask)) {
            squire.client.send('MODE', info.channel, '+' + mode, info.nick);
        }
        
        if (squire.isFoe(info.hostmask)) {
            squire.client.send('MODE', info.channel, '-' + mode, info.nick);
        }
    }
};

squire.isFriend = function (hostmask) { 
    var cfgFriend = squire.match(hostmask, _.pluck(squire.cfg.friends, 'hostmask'));
    var isAdmin   = admin.hostmaskIsAdmin(hostmask);
    
    return cfgFriend || isAdmin;
};

squire.isFoe = function (hostmask) { 
    return squire.match(hostmask, _.pluck(squire.cfg.foes, 'hostmask'));
};

squire.match = function (needle, haystack) {
    var match = false;
    
    if (haystack) {
        for (var j = 0; j < haystack.length; j++) {
            if (minimatch(needle, haystack[j])) {            
                match = true;            
                break;
            }
        }
    }
    
    return match;
};

squire.getHostmasks = function () {
    // I just wanted this to line up, okay?
    var cols  = ['hostmask     AS hostmask', 
                 'mode         AS mode', 
                 'is_friend    AS isFriend'];
    var def   = when.defer();
    var query = [
        'SELECT ',
        cols.join(','),
        'FROM squire_hostmasks',
        'WHERE 1=1',
        'AND enabled = 1'
    ].join("\n");
    
    var qry = db.connection.query(query, function (err, result) {
        if (err && result) {
            def.reject(err);
        } else {
            def.resolve(result);
        }
    });
    
    return def.promise;
};

squire.addFriend = function (options) {
    var def   = when.defer();

    // Grant channel operator status immediately
    admin.grantChannelOperatorStatus(options, options.nick);
    
    var query = [
        "REPLACE INTO squire_hostmasks (hostmask, mode, nick)",
        "VALUES(?, ?, ?)"
    ].join("\n");
    
    var params = [options.hostmask, options.mode || 'v', options.nick];
    
    var qry    = db.connection.query(query, params, function (err, result) {
        if (err && result) {
            def.reject(err);
        } else {
            def.resolve(result);
        }
    });
    
    return def.promise;
};

squire.removeFriend = function (hostmask) {
    var def   = when.defer();
    var query = [
        "UPDATE squire_hostmasks SET enabled = 0 WHERE hostmask = ?"
    ].join("\n");
    
    var params = [hostmask];
    
    var qry    = db.connection.query(query, params, function (err, result) {
        if (err && result) {
            def.reject(err);
        } else {
            def.resolve(result);
        }
    });
    
    return def.promise;
};

module.exports = squire;