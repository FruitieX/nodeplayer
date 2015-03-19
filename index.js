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

// make sure all modules are installed, installs missing ones, then calls loadCallback
function installModules(modules, moduleType, loadCallback) {
    async.eachSeries(modules, function(moduleShortName, callback) {
        var moduleName = 'nodeplayer-' + moduleType + '-' + moduleShortName;
        if (!checkModule(moduleName)) {
            logger.info(moduleName + ' module not found, installing...');
            npm.load({}, function(err) {
                npm.commands.install([moduleName], function(err) {
                    if (err) {
                        logger.error(moduleName + ' installation failed:', err);
                        callback();
                    } else {
                        logger.info(moduleName + ' successfully installed');
                        callback();
                    }
                });
            });
        } else {
            // skip already installed
            callback();
        }
    }, loadCallback);
}

function initModule(moduleShortName, moduleType, callback) {
    var moduleTypeCapital = moduleType.charAt(0).toUpperCase() + moduleType.slice(1);
    var moduleName = 'nodeplayer-' + moduleType + '-' + moduleShortName;
    var module = require(moduleName);

    var moduleLogger = labeledLogger(moduleShortName);
    module.init(player, moduleLogger, function(err) {
        if (!err) {
            player[moduleType + 's'][moduleShortName] = module;
            if (moduleType === 'backend') {
                player.songsPreparing[moduleShortName] = {};
            }

            moduleLogger.info(moduleType + ' module initialized');
            player.callHooks('on' + moduleTypeCapital + 'Initialized', [module]);
        } else {
            moduleLogger.error('while initializing: ' + err);
            player.callHooks('on' + moduleTypeCapital + 'InitError', [module, err]);
        }
        callback(err);
    });
}

async.eachSeries(['plugin', 'backend'], function(moduleType, callback) {
    // first install missing modules
    installModules(config[moduleType + 's'], moduleType, callback);
}, function() {
    // then initialize modules, first all plugins in series, then all backends in parallel
    async.eachSeries(['plugin', 'backend'], function(moduleType, moduleCallback) {
        var moduleTypeCapital = moduleType.charAt(0).toUpperCase() + moduleType.slice(1);

        (moduleType === 'plugin' ? async.eachSeries : async.each)
            (config[moduleType + 's'], function(moduleName, callback) {
            if (checkModule('nodeplayer-' + moduleType + '-' + moduleName)) {
                initModule(moduleName, moduleType, callback);
            }
        }, function(err) {
            logger.info('all ' + moduleType + ' modules initialized');
            player.callHooks('on' + moduleTypeCapital + 'sInitialized');
            moduleCallback();
        });
    });
});
