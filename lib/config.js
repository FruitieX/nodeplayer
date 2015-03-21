var _ = require('underscore');
var mkdirp = require('mkdirp');
var fs = require('fs');
var os = require('os');
var path = require('path');

function getHomeDir() {
    if (process.platform === 'win32') {
        return process.env.USERPROFILE;
    } else {
        return process.env.HOME;
    }
};
exports.getHomeDir = getHomeDir;

function getConfigDir() {
    if (process.platform === 'win32') {
        return process.env.USERPROFILE + '\\nodeplayer\\config';
    } else {
        return process.env.HOME + '/.nodeplayer/config';
    }
};
exports.getConfigDir = getConfigDir;

function getBaseDir() {
    if (process.platform === 'win32') {
        return process.env.USERPROFILE + '\\nodeplayer';
    } else {
        return process.env.HOME + '/.nodeplayer';
    }
};
exports.getBaseDir = getBaseDir;

var defaultConfig = {};

// backends are sources of music, default backends don't require API keys
defaultConfig.backends = [
    'file'
];

// plugins are "everything else", most of the functionality is in plugins
//
// NOTE: ordering is important here, plugins that require another plugin will
// complain if order is wrong.
defaultConfig.plugins = [
    'storequeue',
    'express',
    'rest',
    'socketio',
    'weblistener',
    'httpauth'
];

defaultConfig.logLevel = 'info';
defaultConfig.logColorize = true;
defaultConfig.logExceptions = false; // disabled for now because it looks terrible
defaultConfig.logJson = false;

defaultConfig.songCachePath = getBaseDir() + path.sep + 'song-cache';
defaultConfig.searchResultCnt = 10;
defaultConfig.playedQueueSize = 100;
defaultConfig.songDelayMs = 1000; // add delay between songs to prevent skips

// hostname of the server, may be used as a default value by other plugins
defaultConfig.hostname = os.hostname();

exports.getDefaultConfig = function() {
    return defaultConfig;
};

// path and defaults are optional, if undefined then values corresponding to core config are used
exports.getConfig = function(moduleName, defaults) {
    if (process.env.NODE_ENV === 'test') {
        // unit tests should always use default config
        return (defaults || defaultConfig);
    }

    var configPath = getConfigDir() + path.sep + (moduleName || 'core') + '.json';

    try {
        var userConfig = require(configPath);
        var config = _.defaults(userConfig, defaults || defaultConfig);
        return config;
    } catch(e) {
        if(e.code === 'MODULE_NOT_FOUND') {
            if (!moduleName) {
                // only print welcome text for core module first run
                console.warn('Welcome to nodeplayer!');
                console.warn('----------------------');
            }
            console.warn('\n=====================================================================');
            console.warn('We couldn\'t find the user configuration file for module "' + (moduleName || 'core') + '",');
            console.warn('so a sample configuration file containing default settings will be written into:');
            console.warn(configPath);

            mkdirp.sync(getConfigDir());
            fs.writeFileSync(configPath, JSON.stringify(defaults || defaultConfig, undefined, 4));

            console.warn('\nFile created. Go edit it NOW!');
            console.warn('Note that the file only needs to contain the configuration variables that');
            console.warn('you want to override from the defaults. Also note that it MUST be valid JSON!');
            console.warn('=====================================================================\n');

            if (!moduleName) {
                // only exit on missing core module config
                console.warn('Exiting now. Please re-run nodeplayer when you\'re done configuring!');
                process.exit(0);
            }

            return (defaults || defaultConfig);
        } else {
            console.warn('Unexpected error while loading configuration for module "' + (moduleName || 'core') + '":');
            console.warn(e);
        }
    }
};
