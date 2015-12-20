var npm = require('npm');
var async = require('async');
var labeledLogger = require('./logger');
var nodeplayerConfig = require('./config');
var BuiltinPlugins = require('./plugins');
var BuiltinBackends = require('./backends');
var config = nodeplayerConfig.getConfig();

var _ = require('underscore');
var logger = labeledLogger('modules');

var checkModule = function(module) {
    try {
        require.resolve(module);
        return true;
    } catch (e) {
        return false;
    }
};

// install a single module
var installModule = function(moduleName, callback) {
    logger.info('installing module: ' + moduleName);
    npm.load({}, function(err) {
        npm.commands.install(__dirname, [moduleName], function(err) {
            if (err) {
                logger.error(moduleName + ' installation failed:', err);
                callback();
            } else {
                logger.info(moduleName + ' successfully installed');
                callback();
            }
        });
    });
};

// make sure all modules are installed, installs missing ones, then calls done
var installModules = function(modules, moduleType, forceUpdate, done) {
    async.eachSeries(modules, function(moduleShortName, callback) {
        var moduleName = 'nodeplayer-' + moduleType + '-' + moduleShortName;
        if (!checkModule(moduleName) || forceUpdate) {
            // perform install / update
            installModule(moduleName, callback);
        } else {
            // skip already installed
            callback();
        }
    }, done);
};

var initModule = function(moduleShortName, moduleType, callback) {
    var moduleName = 'nodeplayer-' + moduleType + '-' + moduleShortName;
    var module = require(moduleName);

    module.init(function(err) {
        callback(err, module);
    });
};

// TODO: this probably doesn't work
exports.loadBackends = function(player, backends, forceUpdate, done) {
    // first install missing backends
    installModules(backends, 'backend', forceUpdate, function() {
        // then initialize all backends in parallel
        async.map(backends, function(backend, callback) {
            var moduleLogger = labeledLogger(backend);
            var moduleName = 'nodeplayer-backend-' + backend;
            if (moduleName) {
                var Module = require(moduleName);
                var instance = new Module(function(err) {
                    if (err) {
                        moduleLogger.error('while initializing: ' + err);
                        callback();
                    } else {
                        moduleLogger.verbose('backend initialized');
                        callback(null, instance);
                    }
                });
            } else {
                // skip module whose installation failed
                moduleLogger.info('not loading backend: ' + backend);
                callback();
            }
        }, function(err, results) {
            logger.info('all backend modules initialized');
            results = _.filter(results, _.identity);
            done(results);
        });
    });
};

// TODO: this probably doesn't work
exports.loadPlugins = function(player, plugins, forceUpdate, done) {
    // first install missing plugins
    installModules(plugins, 'plugin', forceUpdate, function() {
        // then initialize all plugins in series
        async.mapSeries(plugins, function(plugin, callback) {
            var moduleLogger = labeledLogger(plugin);
            var moduleName = 'nodeplayer-plugin-' + plugin;
            if (checkModule(moduleName)) {
                var Module = require(moduleName);
                var instance = new Module(player, function(err) {
                    if (err) {
                        moduleLogger.error('while initializing: ' + err);
                        callback();
                    } else {
                        moduleLogger.verbose('plugin initialized');
                        player.callHooks('onPluginInitialized', plugin);
                        callback(null, instance);
                    }
                });
            } else {
                // skip module whose installation failed
                moduleLogger.info('not loading plugin: ' + plugin);
                callback();
            }
        }, function(err, results) {
            logger.info('all plugin modules initialized');
            results = _.filter(results, _.identity);
            done(results);
        });
    });
};

exports.loadBuiltinPlugins = function(player, done) {
    async.mapSeries(BuiltinPlugins, function(Plugin, callback) {
        new Plugin(player, function(err, plugin) {
            var moduleLogger = labeledLogger(plugin.name + ' (builtin)');

            if (err) {
                moduleLogger.error('while initializing: ' + err);
                return callback();
            }
            moduleLogger.verbose('plugin initialized');
            player.callHooks('onPluginInitialized', plugin.name);
            callback(null, [plugin.name, plugin]);
        });
    }, function(err, results) {
        done(_.object(results));
    });
};

exports.loadBuiltinBackends = function(player, done) {
    async.mapSeries(BuiltinBackends, function(Backend, callback) {
        new Backend(function(err, backend) {
            var moduleLogger = labeledLogger(backend.name + ' (builtin)');

            if (err) {
                moduleLogger.error('while initializing: ' + err);
                return callback();
            }
            player.callHooks('onBackendInitialized', backend.name);
            moduleLogger.verbose('backend initialized');
            callback(null, [backend.name, backend]);
        });
    }, function(err, results) {
        done(_.object(results));
    });
};
