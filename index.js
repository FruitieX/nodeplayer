'use strict';

var Player = require('./lib/player');
var nodeplayerConfig = require('./lib/config');
var labeledLogger = require('./lib/logger');

exports.Player = Player;
exports.config = nodeplayerConfig;
exports.logger = labeledLogger;
