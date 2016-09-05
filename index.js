'use strict';

var Player = require('./src/player');
var nodeplayerConfig = require('./src/config');
var labeledLogger = require('./src/logger');

exports.Player = Player;
exports.config = nodeplayerConfig;
exports.logger = labeledLogger;
