var config = require(process.env.HOME + '/.partyplayConfig.js');
// TODO: default config override function
//var defaultConfig = require(__dirname + '/partyplayConfigDefaults.js');

var _ = require('underscore');

var _playerState = {
    config: config,
    queue: [],
    nowPlaying: null,
    plugins: {},
    backends: {},
    frontends: {}
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
        _removeFromQueue(_playerState.nowPlaying.id);
        startPlayingNext = true;
    }

    // TODO: error handling if backends[...] is undefined
    // prepare now playing song
    _playerState.backends[_playerState.nowPlaying.backend].prepareSong(_playerState.nowPlaying.id, function() {
        _callHooks('onSongPrepared', [_playerState]);

        if(startPlayingNext) {
            console.log('playing song: ' + _playerState.nowPlaying.id);

            _playerState.nowPlaying.playbackStart = new Date();

            _callHooks('onSongChange', [_playerState]);

            var songTimeout = parseInt(_playerState.nowPlaying.duration) + config.songDelayMs;
            setTimeout(function() {
                console.log('end of song ' + _playerState.nowPlaying.id);
                _callHooks('onSongEnd', [_playerState]);

                _playerState.nowPlaying = null;
                _onQueueModify();
            }, songTimeout);
        }

        // TODO: support pre-caching multiple songs at once if configured so
        // prepare next song(s) in queue
        if(_playerState.queue.length) {
            _playerState.backends[_playerState.queue[0].backend].prepareSong(_playerState.queue[0].id, function() {
                _callHooks('onNextSongPrepared', [_playerState, 0]);
                // do nothing
            }, function(err) {
                // error pre-caching, get rid of this song
                console.log('error! removing song from queue ' + _playerState.queue[0].id);
                _callHooks('onNextSongPrepareError', [_playerState, 0]);
                _removeFromQueue(_playerState.queue[0].id);
            });
        } else {
            console.log('no songs in queue to prepare');
            _callHooks('onNothingToPrepare', [_playerState]);
        }
    }, function(err) {
        // error pre-caching, get rid of this song
        console.log('error! removing song from queue ' + _playerState.nowPlaying.id);
        _callHooks('onSongPrepareError', [_playerState]);
        _removeFromQueue(_playerState.nowPlaying.id);
    });
};
_playerState.onQueueModify = _onQueueModify;

// find song from queue
var _searchQueue = function(songID) {
    for(var i = 0; i < _playerState.queue.length; i++) {
        if(_playerState.queue[i].id === songID)
            return _playerState.queue[i];
    }

    if(_playerState.nowPlaying && _playerState.nowPlaying.id === songID)
        return _playerState.nowPlaying;

    return null;
};
_playerState.searchQueue = _searchQueue;

// get rid of song in queue
var _removeFromQueue = function(songID) {
    for(var i = 0; i < _playerState.queue.length; i++) {
        if(_playerState.queue[i].id === songID) {
            _playerState.queue.splice(i, 1);
            return;
        }
    }
};
_playerState.removeFromQueue = _removeFromQueue;

// initialize song object
var _initializeSong = function(song) {
    song.upVotes = {};
    song.downVotes = {};
    song.oldness = 0; // favor old songs
    song.playbackStart = null;

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
    if(!song.title || !song.id || !song.duration) {
        return 'required song fields not provided';
    }

    // if same song is already queued, don't create a duplicate
    var queuedSong = _searchQueue(song.id);
    if(queuedSong) {
        console.log('not adding duplicate song to queue: ' + queuedSong.id);
        return 'duplicate songID';
    }

    var err = _callHooks('preSongQueued', [_playerState, song, metadata]);
    if(err)
        return err;

    // no duplicate found, initialize a few properties of song
    queuedSong = _initializeSong(song);

    _callHooks('sortQueue', [_playerState, metadata]);
    _onQueueModify();

    console.log('added song to queue: ' + queuedSong.id);
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
