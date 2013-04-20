/**
 * caps lock saturday - capitalize bots nick and all messages
 * when activated
 *
 */
"use strict";

var cls = { };

cls.init = function (client) {
    client.addListener('message#', function (from, to, message) {
        if (message.toLowerCase() === '!cls') {
            cls.capitalizeNick(client, client.config.nick);
        }
    });
};

cls.capitalizeNick = function (client, currentNick) {
    var upperCaseNick = currentNick.toUpperCase();
    var lowerCaseNick = currentNick.toLowerCase();
    var newNick       = upperCaseNick;
    
    if (currentNick === upperCaseNick) {
        newNick = lowerCaseNick;
    } else {
        newNick = upperCaseNick;
    }
    
    client.send('NICK', newNick);
};

module.exports = cls;