var _ = require('underscore');

var userConfig = require(process.env.HOME + '/.partyplayConfig.js');
var defaultConfig = require(__dirname + '/partyplayConfigDefaults.js');
var config = _.defaults(userConfig, defaultConfig);

var _playerState = {
    config: config,
    queue: [],
    nowPlaying: null,
    plugins: {},
    backends: {}
}

// call hook function in all modules
// if any hooks return a truthy value, it is an error and we abort
// be very careful with calling hooks from within a hook, infinite loops are possible
var _callHooks = function(hook, argv) {
    // _.find() used instead of _.each() because we want to break out as soon
    // as a hook returns a truthy value (used to indicate an error, e.g. in form
    // of a string)
    return _.find(_playerState.plugins, function(plugin) {
        if(plugin[hook]) {
            return plugin[hook].apply(null, argv);
        }
    });
};
_playerState.callHooks = _callHooks;

// returns number of hook functions attached to given hook
var _numHooks = function(hook) {
    var cnt = 0;

    _.find(_playerState.plugins, function(plugin) {
        if(plugin[hook]) {
            cnt++;
        }
    });

    return cnt;
};
_playerState.numHooks = _numHooks;

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - prepare first and second songs in the queue
var _onQueueModify = function() {
    if(!_playerState.queue.length) {
        _callHooks('onEndOfQueue', [_playerState]);
        console.log('end of queue, waiting for more songs');
        return;
    }

    var startPlayingNext = false;
    if(!_playerState.nowPlaying) {
        // play song
        _playerState.nowPlaying = _playerState.queue.shift();
        _removeFromQueue(_playerState.nowPlaying.backendName, _playerState.nowPlaying.songID);
        startPlayingNext = true;
    }

    // TODO: error handling if backends[...] is undefined
    // prepare now playing song
    _playerState.backends[_playerState.nowPlaying.backendName].prepareSong(_playerState.nowPlaying.songID, function() {
        _callHooks('onSongPrepared', [_playerState]);

        if(startPlayingNext) {
            console.log('playing song: ' + _playerState.nowPlaying.songID);

            _playerState.nowPlaying.playbackStart = new Date();

            _callHooks('onSongChange', [_playerState]);

            var songTimeout = parseInt(_playerState.nowPlaying.duration) + config.songDelayMs;
            setTimeout(function() {
                console.log('end of song ' + _playerState.nowPlaying.songID);
                _callHooks('onSongEnd', [_playerState]);

                _playerState.nowPlaying = null;
                _onQueueModify();
            }, songTimeout);
        }

        // TODO: support pre-caching multiple songs at once if configured so
        // prepare next song(s) in queue
        if(_playerState.queue.length) {
            _playerState.backends[_playerState.queue[0].backendName].prepareSong(_playerState.queue[0].songID, function() {
                _callHooks('onNextSongPrepared', [_playerState, 0]);
                // do nothing
            }, function(err) {
                // error pre-caching, get rid of this song
                console.log('error! removing song from queue ' + _playerState.queue[0].songID);
                _callHooks('onNextSongPrepareError', [_playerState, 0]);
                _removeFromQueue(_playerState.queue[0].backendName, _playerState.queue[0].songID);
            });
        } else {
            console.log('no songs in queue to prepare');
            _callHooks('onNothingToPrepare', [_playerState]);
        }
    }, function(err) {
        // error pre-caching, get rid of this song
        console.log('error! removing song from queue ' + _playerState.nowPlaying.songID);
        _callHooks('onSongPrepareError', [_playerState]);
        _removeFromQueue(_playerState.nowPlaying.backendName, _playerState.nowPlaying.songID);
    });
};
_playerState.onQueueModify = _onQueueModify;

// find song from queue
var _searchQueue = function(backendName, songID) {
    for(var i = 0; i < _playerState.queue.length; i++) {
        if(_playerState.queue[i].songID === songID
                && _playerState.queue[i].backendName === backendName)
            return _playerState.queue[i];
    }

    if(_playerState.nowPlaying && _playerState.nowPlaying.songID === songID
            && _playerState.nowPlaying.backendName === backendName)
        return _playerState.nowPlaying;

    return null;
};
_playerState.searchQueue = _searchQueue;

// get rid of song in queue
var _removeFromQueue = function(backendName, songID) {
    for(var i = 0; i < _playerState.queue.length; i++) {
        if(_playerState.queue[i].songID === songID && _playerState.queue[i].backendName === backendName) {
            _playerState.queue.splice(i, 1);
            return;
        }
    }
};
_playerState.removeFromQueue = _removeFromQueue;

// TODO: partyplay specific stuff
// initialize song object
var _initializeSong = function(song) {
    song.playbackStart = null;
    song.timeAdded = new Date().getTime();

    _playerState.queue.push(song);
    return song;
};
_playerState.initializeSong = _initializeSong;

// add a song to the queue
//
// metadata is optional and can contain information passed between plugins
// (e.g. which user added a song)
var _addToQueue = function(song, metadata) {
    // check that required fields are provided
    if(!song.title || !song.songID || !song.backendName || !song.duration) {
        return 'required song fields not provided';
    }

    // if same song is already queued, don't create a duplicate
    var queuedSong = _searchQueue(song.backendName, song.songID);
    if(queuedSong) {
        console.log('not adding duplicate song to queue: ' + queuedSong.songID);
        return 'duplicate songID';
    }

    var err = _callHooks('preSongQueued', [_playerState, song, metadata]);
    if(err)
        return err;

    // no duplicate found, initialize a few properties of song
    queuedSong = _initializeSong(song);

    _callHooks('sortQueue', [_playerState, metadata]);
    _onQueueModify();

    console.log('added song to queue: ' + queuedSong.songID);
    _callHooks('postSongQueued', [_playerState, queuedSong, metadata]);
};
_playerState.addToQueue = _addToQueue;

_.each(config.plugins, function(pluginName) {
    // TODO: put plugin modules into npm
    var plugin = require('./plugins/' + pluginName);

    plugin.init(_playerState, function() {
        _playerState.plugins[pluginName] = plugin;
        console.log('plugin ' + pluginName + ' initialized');
    }, function(err) {
        console.log('error in ' + pluginName + ': ' + err);
        _callHooks('onPluginInitError', [_playerState, plugin]);
    });
});

// TODO: maybe wait for callbacks before this?
_callHooks('onPluginsInitialized', [_playerState]);

// init backends
_.each(config.backends, function(backendName) {
    // TODO: put backend modules into npm
    // must implement .search, .prepareSong, .init
    var backend = require('./backends/' + backendName);

    backend.init(_playerState, function() {
        _playerState.backends[backendName] = backend;

        console.log('backend ' + backendName + ' initialized');
        _callHooks('onBackendInit', [_playerState, backend]);
    }, function(err) {
        console.log('error in ' + backendName + ': ' + err);
        _callHooks('onBackendInitError', [_playerState, backend]);
    });
});

// TODO: maybe wait for callbacks before this?
_callHooks('onBackendsInitialized', [_playerState]);
