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
        key: fs.readFileSync(config.tlsKey),
        cert: fs.readFileSync(config.tlsCert),
        ca: fs.readFileSync(config.tlsCa),
        requestCert: config.requestCert,
        rejectUnauthorized: config.rejectUnauthorized
    };

    player.expressApp = express();
    player.expressServer = https.createServer(options, player.expressApp).listen(process.env.PORT || config.port);

    callback();
};

module.exports = expressjs;
