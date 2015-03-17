'use strict';
var _ = require('underscore');
var async = require('async');
var labeledLogger = require('./logger');
var Player = require('./player');
var config = require('nodeplayer-defaults')();

var logger = labeledLogger('core');

function checkModule(module) {
    try {
        require.resolve(module);
    } catch(e) {
        logger.error('Cannot find module: ' + module);
        process.exit(e.code);
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
        if(!err) {
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

// init backends
async.each(config.backends, function(backendName, callback) {
    var backendFile = 'nodeplayer-' + backendName;
    checkModule(backendFile);
    var backend = require('nodeplayer-' + backendName);

    var backendLogger = labeledLogger(backendName);
    backend.init(player, backendLogger, function(err) {
        if(!err) {
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
}, function(err) {
    player.callHooks('onBackendsInitialized');
    logger.info('ready');
});
