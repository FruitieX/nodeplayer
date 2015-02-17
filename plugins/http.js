var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');

var expressjs = {};
var config, player;

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
expressjs.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    player.expressApp = express();

    var options = {};
    if(config.tls) {
        options = {
            tls: config.tls,
            key: fs.readFileSync(config.tlsKey),
            cert: fs.readFileSync(config.tlsCert),
            ca: fs.readFileSync(config.tlsCa),
            requestCert: config.requestCert,
            rejectUnauthorized: config.rejectUnauthorized
        };
        player.expressTls = true;
        player.expressServer = https.createServer(options, player.expressApp).listen(process.env.PORT || config.port);
    } else {
        player.expressServer = http.createServer(player.expressApp).listen(process.env.PORT || config.port);
    }

    callback();
};

module.exports = expressjs;
