'use strict';

var Player = require('./lib/player');
var nodeplayerConfig = require('./lib/config');

exports.player = new Player();
exports.config = nodeplayerConfig;
