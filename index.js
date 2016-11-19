'use strict';

var config = require('./src/config');
var logger = require('./src/logger');

import Player from './src/player';
import Backend from './src/backends';
import Plugin from './src/plugins';

export {
  Player,
  Backend,
  Plugin,
  config,
  logger,
}
