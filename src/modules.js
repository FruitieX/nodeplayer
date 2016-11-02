const npm = require('npm');
const async = require('async');
const labeledLogger = require('./logger');
import defaultPlugins from './plugins/defaults';
const BuiltinBackends = require('./backends');

const _ = require('lodash');
const logger = labeledLogger('modules');

const checkModule = module => {
  try {
    require.resolve(module);
    return true;
  } catch (e) {
    return false;
  }
};

// install a single module
const installModule = (moduleName, callback) => {
  logger.info('installing module: ' + moduleName);
  npm.load({}, err => {
    npm.commands.install(__dirname, [moduleName], err => {
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
const installModules = (modules, moduleType, forceUpdate, done) => {
  async.eachSeries(modules, (moduleShortName, callback) => {
    const moduleName = 'nodeplayer-' + moduleType + '-' + moduleShortName;
    if (!checkModule(moduleName) || forceUpdate) {
            // perform install / update
      installModule(moduleName, callback);
    } else {
            // skip already installed
      callback();
    }
  }, done);
};

/*
var initModule = (moduleShortName, moduleType, callback) => {
  var moduleName = 'nodeplayer-' + moduleType + '-' + moduleShortName;
  var module = require(moduleName);

  module.init((err) => {
    callback(err, module);
  });
};
*/

exports.loadBackends = (player, backends, forceUpdate, done) => {
  async.mapSeries(backends, (moduleName, callback) => {
    moduleName = 'nodeplayer-backend-' + moduleName;

    const Backend = require(moduleName);
    const backend = new Backend(err => {
      // defer execution in case callback was called synchronously
      process.nextTick(() => {
        if (err) {
          backend.log.error('while initializing: ' + err);
          return callback();
        }

        player.callHooks('onBackendInitialized', [backend.name]);
        backend.log.verbose('backend initialized');
        callback(null, { [backend.name]: backend });
      });
    });
  }, (err, results) => {
    done(Object.assign({}, ...results));
  });
};

/*
  // first install missing backends
  // installModules(backends, 'backend', forceUpdate, () => {
  // then initialize all backends in parallel
    async.map(backends, (backend, callback) => {
      const moduleLogger = labeledLogger(backend);
      const moduleName = 'nodeplayer-backend-' + backend;
      if (moduleName) {
        moduleLogger.verbose('initializing...');

        const Module = require(moduleName);
        const instance = new Module(err => {
          if (err) {
            moduleLogger.error('while initializing: ' + err);
            callback();
          } else {
            moduleLogger.verbose('backend initialized');
            player.callHooks('onBackendInitialized', [backend]);
            callback(null, instance);
          }
        });
      } else {
        // skip module whose installation failed
        moduleLogger.info('not loading backend: ' + backend);
        callback();
      }
    }, (err, results) => {
      logger.info('all backend modules initialized');
      results = _.filter(results, _.identity);
      done(results);
    });
  });
};
*/

// TODO: this probably doesn't work
// needs rewrite
exports.loadPlugins = (player, plugins, forceUpdate, done) => {
    // first install missing plugins
  installModules(plugins, 'plugin', forceUpdate, () => {
        // then initialize all plugins in series
    async.mapSeries(plugins, (plugin, callback) => {
      const moduleLogger = labeledLogger(plugin);
      const moduleName = 'nodeplayer-plugin-' + plugin;
      if (checkModule(moduleName)) {
        moduleLogger.verbose('initializing...');

        const Module = require(moduleName);
        const instance = new Module(player, err => {
          if (err) {
            moduleLogger.error('while initializing: ' + err);
            callback();
          } else {
            moduleLogger.verbose('plugin initialized');
            player.callHooks('onPluginInitialized', [plugin]);
            callback(null, instance);
          }
        });
      } else {
                // skip module whose installation failed
        moduleLogger.info('not loading plugin: ' + plugin);
        callback();
      }
    }, (err, results) => {
      logger.info('all plugin modules initialized');
      results = _.filter(results, _.identity);
      done(results);
    });
  });
};

exports.loadBuiltinPlugins = (player, done) => {
  async.mapSeries(defaultPlugins, (Plugin, callback) => {
    const plugin = new Plugin(player, err => {
      // defer execution in case callback was called synchronously
      process.nextTick(() => {
        if (err) {
          plugin.log.error('while initializing: ' + err);
          return callback();
        }

        plugin.log.verbose('plugin initialized');
        player.callHooks('onPluginInitialized', [plugin.name]);
        callback(null, { [plugin.name]: plugin });
      });
    });
  }, (err, results) => {
    done(Object.assign({}, ...results));
  });
};

exports.loadBuiltinBackends = (player, done) => {
  async.mapSeries(BuiltinBackends, (Backend, callback) => {
    const backend = new Backend(err => {
      // defer execution in case callback was called synchronously
      process.nextTick(() => {
        if (err) {
          backend.log.error('while initializing: ' + err);
          return callback();
        }

        player.callHooks('onBackendInitialized', [backend.name]);
        backend.log.verbose('backend initialized');
        callback(null, { [backend.name]: backend });
      });
    });
  }, (err, results) => {
    done(Object.assign({}, ...results));
  });
};
