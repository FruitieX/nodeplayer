var labeledLogger = require('./logger');

/**
 * Super constructor for plugins
 */
function Plugin() {
    this.name = this.constructor.name.toLowerCase();
    this.log = labeledLogger(this.name);
    this.log.info('initializing...');
    this.hooks = {};
}

Plugin.prototype.registerHook = function(hook, callback) {
    this.hooks[hook] = callback;
};

module.exports = Plugin;
