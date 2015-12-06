'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var https = require('https');
var http = require('http');
var fs = require('fs');

var util = require('util');
var Plugin = require('../plugin');

function Express(vars, callback) {
    Plugin.apply(this);

    var config = require('../config').getConfig(this);
    vars.app = express();

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
        vars.app.set('tls', true);
        vars.httpServer = https.createServer(options, vars.app)
                .listen(process.env.PORT || config.port);
    } else {
        vars.httpServer = http.createServer(vars.app)
                .listen(process.env.PORT || config.port);
    }

    vars.app.use(cookieParser());
    vars.app.use(bodyParser.json({limit: '100mb'}));
    vars.app.use(bodyParser.urlencoded({extended: true}));

    callback(null, this);
}

util.inherits(Express, Plugin);

module.exports = Express;
