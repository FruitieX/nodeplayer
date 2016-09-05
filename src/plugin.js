const labeledLogger = require('./logger');

/**
 * Super constructor for plugins
 */
export default class Plugin {
  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.log = labeledLogger(this.name);
    this.hooks = {};
  }

  registerHook(hook, callback) {
    this.hooks[hook] = callback;
  }
}
