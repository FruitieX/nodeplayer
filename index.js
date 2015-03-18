'use strict';
var _ = require('underscore');
var npm = require('npm');
var async = require('async');
var labeledLogger = require('./logger');
var Player = require('./player');
var nodeplayerConfig = require('nodeplayer-config');
var config = nodeplayerConfig.getConfig();

var logger = labeledLogger('core');

function checkModule(module) {
    try {
        require.resolve(module);
        return true;
    } catch (e) {
        return false;
    }
}

var player = new Player();

// init plugins
async.each(config.plugins, function(pluginName, callback) {
    // TODO: put plugin modules into npm
    // must implement .init, can implement hooks
    var pluginFile = './plugins/' + pluginName;
    checkModule(pluginFile);
    var plugin = require('./plugins/' + pluginName);

    var pluginLogger = labeledLogger(pluginName);
    plugin.init(player, pluginLogger, function(err) {
        if (!err) {
            // TODO: some plugins set player.plugin = blah; now, and we do this here.
            player.plugins[pluginName] = plugin;
            pluginLogger.info('plugin initialized');
            player.callHooks('onPluginInitialized', [plugin]);
        } else {
            pluginLogger.error('error while initializing: ' + err);
            player.callHooks('onPluginInitError', [plugin, err]);
        }
        callback(err);
    });
}, function(err) {
    player.callHooks('onPluginsInitialized');
});

function initBackend(backendName, callback) {
    var backend = require('nodeplayer-backend-' + backendName);

    var backendLogger = labeledLogger(backendName);
    backend.init(player, backendLogger, function(err) {
        if (!err) {
            player.backends[backendName] = backend;
            player.songsPreparing[backendName] = {};

            backendLogger.info('backend initialized');
            player.callHooks('onBackendInitialized', [backend]);
        } else {
            backendLogger.error('error while initializing: ' + err);
            player.callHooks('onBackendInitError', [backend, err]);
        }
        callback(err);
    });
}

async.eachSeries(config.backends, function(backendName, callback) {
    // check backends & install if needed
    if (!checkModule('nodeplayer-backend-' + backendName)) {
        logger.info(backendName + 'backend module not found, installing...');
        npm.load({}, function(err) {
            npm.commands.install(['nodeplayer-backend-' + backendName], function(err) {
                if (err) {
                    logger.error(backendName + ' installation failed:', err);
                    callback();
                } else {
                    logger.info(backendName + ' successfully installed');
                    callback();
                }
            });
        });
    } else {
        // skip already installed
        callback();
    }
}, function() {
    // init backends
    async.each(config.backends, function(backendName, callback) {
        if (checkModule('nodeplayer-backend-' + backendName)) {
            initBackend(backendName, callback);
        }
    }, function(err) {
        player.callHooks('onBackendsInitialized');
        logger.info('ready');
    });
});
