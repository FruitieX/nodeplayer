'use strict';
var config = require('nodeplayer-config')();
var winston = require('winston');

module.exports = function(label) {
    return new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({
                label: label,
                level: config.logLevel,
                colorize: config.logColorize,
                handleExceptions: config.logExceptions,
                json: config.logJson
            })
        ]
    });
};
