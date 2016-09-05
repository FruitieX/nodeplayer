const coreConfig = require('./config').getConfig();
const config = require('./config');
const labeledLogger = require('./logger');

/**
 * Super constructor for plugins
 */
export default class Plugin {
  constructor(defaultConfig) {
    this.name = this.constructor.name.toLowerCase();
    this.log = labeledLogger(this.name);
    this.hooks = {};
    this.coreConfig = coreConfig;

    if (defaultConfig) {
      this.config = config.getConfig(this, defaultConfig);
    }
  }

  registerHook(hook, callback) {
    this.hooks[hook] = callback;
  }
}
