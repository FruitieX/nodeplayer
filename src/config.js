var _ = require('lodash');
var mkdirp = require('mkdirp');
var fs = require('fs');
var os = require('os');
var path = require('path');

function getHomeDir() {
  if (process.platform === 'win32') {
    return process.env.USERPROFILE;
  }

  return process.env.HOME;
}
exports.getHomeDir = getHomeDir;

function getBaseDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE, 'nodeplayer');
  }

  return path.join(process.env.HOME, '.nodeplayer');
}
exports.getBaseDir = getBaseDir;

var defaultConfig = {};

// backends are sources of music
defaultConfig.backends = [
  'youtube',
];

// plugins are "everything else", most of the functionality is in plugins
//
// NOTE: ordering is important here, plugins that require another plugin will
// complain if order is wrong.
defaultConfig.plugins = [
  'weblistener',
];

defaultConfig.logLevel = 'info';
defaultConfig.logColorize = true;
defaultConfig.logExceptions = false; // disabled for now because it looks terrible
defaultConfig.logJson = false;

defaultConfig.songCachePath = path.join(getBaseDir(), 'song-cache');
defaultConfig.searchResultCnt = 10;
defaultConfig.playedQueueSize = 100;
defaultConfig.songDelayMs = 1000; // add delay between songs to prevent skips

defaultConfig.songPrepareTimeout = 10000; // cancel preparation if no progress

// built-in express plugin
defaultConfig.port = 8080;
defaultConfig.tls = false;
defaultConfig.key = path.join(getBaseDir(), 'nodeplayer-key.pem');
defaultConfig.cert = path.join(getBaseDir(), 'nodeplayer-cert.pem');
defaultConfig.ca = path.join(getBaseDir(), 'nodeplayer-ca.pem');
defaultConfig.requestCert = false;
defaultConfig.rejectUnauthorized = true;

// built-in local file backend
defaultConfig.mongo = 'mongodb://localhost:27017/nodeplayer-backend-file';
defaultConfig.rescanAtStart = false;
defaultConfig.importPath = path.join(getHomeDir(), 'music');
defaultConfig.importFormats = [
  'mp3',
  'flac',
  'ogg',
  'opus',
];
defaultConfig.concurrentProbes = 4;
defaultConfig.followSymlinks = true;
defaultConfig.maxScore = 10; // FIXME: ATM the search algo can return VERY irrelevant results

// hostname of the server, may be used as a default value by other plugins
defaultConfig.hostname = os.hostname();

exports.getDefaultConfig = function() {
  return defaultConfig;
};

// path and defaults are optional, if undefined then values corresponding to core config are used
exports.getConfig = function(module, defaults) {
  if (process.env.NODE_ENV === 'test') {
        // unit tests should always use default config
    return (defaults || defaultConfig);
  }

  var moduleName = module ? module.name : null;

  var configPath = path.join(getBaseDir(), 'config', (moduleName || 'core') + '.json');

  try {
    var userConfig = require(configPath);
    var config = _.defaults(userConfig, defaults || defaultConfig);
    return config;
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      if (!moduleName) {
                // only print welcome text for core module first run
        console.warn('Welcome to nodeplayer!');
        console.warn('----------------------');
      }
      console.warn('\n=====================================================================');
      console.warn('We couldn\'t find the user configuration file for module "' +
                    (moduleName || 'core') + '",');
      console.warn('so a sample configuration file containing default settings ' +
                    'will be written into:');
      console.warn(configPath);

      mkdirp.sync(path.join(getBaseDir(), 'config'));
      fs.writeFileSync(configPath, JSON.stringify(defaults || defaultConfig, undefined, 4));

      console.warn('\nFile created. Go edit it NOW!');
      console.warn('Note that the file only needs to contain the configuration ' +
                    'variables that');
      console.warn('you want to override from the defaults. Also note that it ' +
                    'MUST be valid JSON!');
      console.warn('=====================================================================\n');

      if (!moduleName) {
                // only exit on missing core module config
        console.warn('Exiting now. Please re-run nodeplayer when you\'re done ' +
                        'configuring!');
        process.exit(0);
      }

      return (defaults || defaultConfig);
    }

    console.warn('Unexpected error while loading configuration for module "' +
                  (moduleName || 'core') + '":');
    console.warn(e);
  }
};
