'use strict';

var auth = require('http-auth');
var fs = require('fs');

var config;
var player;

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
exports.init = function(_player, _logger, callback) {
    player = _player;
    config = _player.config;

    // dependencies
    if (!player.app) {
        callback('module must be initialized after expressjs module!');
    } else {
        var basic = auth.basic({
                realm: 'partyplay listener'
            }, function(username, password, callback) {
                callback(username === config.username && password === config.password);
            }
        );

        // put /song/* behind authentication for now
        // TODO: configurable which paths require authentication?
        player.app.use('/song/*', auth.connect(basic));
        callback();
    }
};
