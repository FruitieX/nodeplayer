/**
 * Constructor
 */

var labeledLogger = require('./logger');

function Plugin() {
    this.name = this.constructor.name.toLowerCase();
    this.hooks = {};
    this.log = labeledLogger(this.name);
}

Plugin.prototype.registerHook = function(hook, callback) {
    this.hooks[hook] = callback;
};

module.exports = Plugin;
