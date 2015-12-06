var Plugins = [];
Plugins.push(require('./express'));
Plugins.push(require('./rest')); // NOTE: must be initialized after express

module.exports = Plugins;
