var express = require('express');
var https = require('https');
var fs = require('fs');

var expressjs = {};
var config, player;

// called when partyplay is started to initialize the plugin
// do any necessary initialization here
expressjs.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    var options = {
        tls: config.tls,
        key: config.tlsKey,
        cert: config.tlsCert,
        ca: config.tlsCa,
        requestCert: config.requestCert,
        rejectUnauthorized: config.rejectUnauthorized
    };

    player.expressApp = express();
    player.expressServer = https.createServer(options, player.expressApp).listen(process.env.PORT || config.port);

    callback();
};

module.exports = expressjs;
