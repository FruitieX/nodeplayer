var express = require('express');

var expressjs = {};
var config, player;

// called when partyplay is started to initialize the plugin
// do any necessary initialization here
expressjs.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    player.expressApp = express();
    player.expressServer = player.expressApp.listen(process.env.PORT || config.port);

    callback();
};

module.exports = expressjs;
