/**
 * Constructor
 */
function Plugin() {
    this.name = this.constructor.name.toLowerCase();
}

Plugin.prototype.registerHook = function(hook, callback) {
};

module.exports = Plugin;
