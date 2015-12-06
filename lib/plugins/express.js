'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var https = require('https');
var http = require('http');
var fs = require('fs');

var util = require('util');
var Plugin = require('../plugin');

function Express(player, callback) {
    Plugin.apply(this);

    // NOTE: no argument passed so we get the core's config
    var config = require('../config').getConfig();
    player.app = express();

    var options = {};
    if (config.tls) {
        options = {
            tls: config.tls,
            key: config.key ? fs.readFileSync(config.key) : undefined,
            cert: config.cert ? fs.readFileSync(config.cert) : undefined,
            ca: config.ca ? fs.readFileSync(config.ca) : undefined,
            requestCert: config.requestCert,
            rejectUnauthorized: config.rejectUnauthorized
        };
        // TODO: deprecated!
        player.app.set('tls', true);
        player.httpServer = https.createServer(options, player.app)
                .listen(process.env.PORT || config.port);
    } else {
        player.httpServer = http.createServer(player.app)
                .listen(process.env.PORT || config.port);
    }

    player.app.use(cookieParser());
    player.app.use(bodyParser.json({limit: '100mb'}));
    player.app.use(bodyParser.urlencoded({extended: true}));

    callback(null, this);
}

util.inherits(Express, Plugin);

module.exports = Express;
