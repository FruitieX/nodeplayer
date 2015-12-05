var npm = require('npm');
var async = require('async');
var labeledLogger = require('./logger');
var nodeplayerConfig = require('./config');
var config = nodeplayerConfig.getConfig();

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

exports.loadBackends = function(backends, forceUpdate, done) {
    // first install missing backends
    installModules(backends, 'backend', forceUpdate, function() {
        // then initialize all backends in parallel
        async.map(backends, function(backend, callback) {
            var moduleLogger = labeledLogger(backend);
            var moduleName = 'nodeplayer-backend-' + backend;
            if(moduleName) {
                require(moduleName).init(function(err) {
                    if (err) {
                        moduleLogger.error('while initializing: ' + err);
                    }
                    callback();
                });
            } else {
                // skip module whose installation failed
                moduleLogger.info('not loading backend: ' + backend);
                callback();
            }
        }, function(err) {
            logger.info('all backend modules initialized');
            done();
        });
    });
};

exports.loadPlugins = function(plugins, vars, forceUpdate, done) {
    // first install missing plugins
    installModules(plugins, 'plugin', forceUpdate, function() {
        // then initialize all plugins in series
        async.mapSeries(plugins, function(plugin, callback) {
            var moduleLogger = labeledLogger(plugin);
            var moduleName = 'nodeplayer-plugin-' + plugin;
            if(checkModule(moduleName)) {
                require(moduleName).init(vars, function(err) {
                    if (err) {
                        moduleLogger.error('while initializing: ' + err);
                        callback();
                    } else {
                        callback(null, plugin);
                    }
                });
            } else {
                // skip module whose installation failed
                moduleLogger.info('not loading plugin: ' + plugin);
                callback();
            }
        }, function(err, results) {
            logger.info('all plugin modules initialized');
            done(results);
        });
    });
};
