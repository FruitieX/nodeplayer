var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');

var config, player;

// called when nodeplayer is started to initialize the plugin
// do any necessary initialization here
exports.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    player.app = express();

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
        player.app.set('tls', true);
        player.httpServer = https.createServer(options, player.app).listen(process.env.PORT || config.port);
    } else {
        player.httpServer = http.createServer(player.app).listen(process.env.PORT || config.port);
    }

    callback();
};
