var _ = require('underscore');
var async = require('async');

var userConfig = require(process.env.HOME + '/.partyplayConfig.js');
var defaultConfig = require(__dirname + '/partyplayConfigDefaults.js');
var config = _.defaults(userConfig, defaultConfig);

var player = {
    config: config,
    queue: [],
    nowPlaying: null,
    plugins: {},
    backends: {}
}

// call hook function in all modules
// if any hooks return a truthy value, it is an error and we abort
// be very careful with calling hooks from within a hook, infinite loops are possible
var callHooks = function(hook, argv) {
    // _.find() used instead of _.each() because we want to break out as soon
    // as a hook returns a truthy value (used to indicate an error, e.g. in form
    // of a string)
    return _.find(player.plugins, function(plugin) {
        if(plugin[hook]) {
            return plugin[hook].apply(null, argv);
        }
    });
};
player.callHooks = callHooks;

// returns number of hook functions attached to given hook
var numHooks = function(hook) {
    var cnt = 0;

    _.find(player.plugins, function(plugin) {
        if(plugin[hook]) {
            cnt++;
        }
    });

    return cnt;
};
player.numHooks = numHooks;

player.songEndTimeout = null;
var startPlayback = function() {
    var np = player.nowPlaying;
    console.log('playing song: ' + np.songID);

    np.playbackStart = new Date();
    np.playing = true; // TODO: is there a better solution?

    callHooks('onSongChange', [player]);

    var duration = parseInt(np.duration) + config.songDelayMs;
    if(player.songEndTimeout) {
        console.log('DEBUG: songEndTimeout was cleared');
        clearTimeout(player.songEndTimeout);
    }
    player.songEndTimeout = setTimeout(function() {
        console.log('end of song ' + np.songID);
        callHooks('onSongEnd', [player]);

        player.nowPlaying = null;
        onQueueModify();
    }, duration);
};

var prepareError = function(song, err) {
    console.log('DEBUG: error! (' + err + ') removing song from queue: ' + song.songID);
    removeFromQueue(song.backendName, song.songID);
    if(player.nowPlaying.backendName === song.backendName &&
            player.nowPlaying.songID === song.songID) {
        player.nowPlaying = null;
    }
    callHooks('onSongPrepareError', [player]); // TODO: consider changing player to song?
    onQueueModify(); // if this was now playing we need to find another song
};

player.songsPreparing = {};
var prepareSong = function(song, asyncCallback) {
    if(!song) {
        console.log('DEBUG: prepareSong() without song');
        asyncCallback(true);
        return;
    }

    // create songsPreparing for current backend if one does not exist
    if(!player.songsPreparing[song.backendName])
        player.songsPreparing[song.backendName] = {};

    // TODO: check for song.prepared before again asking the plugin?
    // NOTE: in this case we MUST run asyncCallback()
    // don't run prepareSong() multiple times for the same song
    if(!player.songsPreparing[song.backendName][song.songID]) {
        console.log('DEBUG: prepareSong() ' + song.songID);
        player.songsPreparing[song.backendName][song.songID] = true;

        player.backends[song.backendName].prepareSong(song.songID, function() {
            // mark song as prepared
            callHooks('onSongPrepared', song);

            delete(player.songsPreparing[song.backendName][song.songID]);
            song.prepared = true;
            asyncCallback();
        }, function(err) {
            // error while preparing
            prepareError(song, err);

            delete(player.songsPreparing[song.backendName][song.songID]);
            asyncCallback(true);
        });
    } else {
        asyncCallback();
    }
};

// prepare now playing and queued songs for playback
var prepareSongs = function() {
    async.series([
        function(callback) {
            // prepare now-playing song if it exists and if not prepared
            if(player.nowPlaying) {
                prepareSong(player.nowPlaying, function(err) {
                    // when done preparing now playing, run prepareSongs again
                    // next event loop in case now playing song has changed
                    // since we started preparing it
                    if (!err && player.nowPlaying && player.nowPlaying.prepared && !player.nowPlaying.playing)
                        startPlayback();

                    callback(err);
                });
            } else {
                callback(true);
            }
        },
        function(callback) {
            // prepare next song in queue if it exists and if not prepared
            if(player.queue[0]) {
                prepareSong(player.queue[0], callback);
            } else {
                callback(true);
            }
        }
    ]);
};

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - call prepareSongs()
var onQueueModify = function() {
    if(!player.queue.length) {
        callHooks('onEndOfQueue', [player]);
        console.log('end of queue, waiting for more songs');
        return;
    }

    // set next song as now playing
    if(!player.nowPlaying)
        player.nowPlaying = player.queue.shift();

    prepareSongs();
};
player.onQueueModify = onQueueModify;

// find song from queue
var searchQueue = function(backendName, songID) {
    for(var i = 0; i < player.queue.length; i++) {
        if(player.queue[i].songID === songID
                && player.queue[i].backendName === backendName)
            return player.queue[i];
    }

    if(player.nowPlaying && player.nowPlaying.songID === songID
            && player.nowPlaying.backendName === backendName)
        return player.nowPlaying;

    return null;
};
player.searchQueue = searchQueue;

// get rid of song in queue
var removeFromQueue = function(backendName, songID) {
    for(var i = 0; i < player.queue.length; i++) {
        if(player.queue[i].songID === songID && player.queue[i].backendName === backendName) {
            player.queue.splice(i, 1);
            return;
        }
    }
};
player.removeFromQueue = removeFromQueue;

// TODO: partyplay specific stuff
// initialize song object
var initializeSong = function(song) {
    song.playbackStart = null;
    song.timeAdded = new Date().getTime();

    player.queue.push(song);
    return song;
};
player.initializeSong = initializeSong;

// add a song to the queue
//
// metadata is optional and can contain information passed between plugins
// (e.g. which user added a song)
var addToQueue = function(song, metadata) {
    console.log('DEBUG: addToQueue(): ' + song.songID);
    // check that required fields are provided
    if(!song.title || !song.songID || !song.backendName || !song.duration) {
        console.log('required song fields not provided: ' + song.songID);
        return 'required song fields not provided';
    }

    // if same song is already queued, don't create a duplicate
    var queuedSong = searchQueue(song.backendName, song.songID);
    if(queuedSong) {
        console.log('not adding duplicate song to queue: ' + queuedSong.songID);
        return 'duplicate songID';
    }

    var err = callHooks('preSongQueued', [player, song, metadata]);
    if(err)
        return err;

    // no duplicate found, initialize a few properties of song
    queuedSong = initializeSong(song);

    callHooks('sortQueue', [player, metadata]);
    onQueueModify();

    console.log('added song to queue: ' + queuedSong.songID);
    callHooks('postSongQueued', [player, queuedSong, metadata]);
};
player.addToQueue = addToQueue;

_.each(config.plugins, function(pluginName) {
    // TODO: put plugin modules into npm
    // must implement .init, can implement hooks
    var plugin = require('./plugins/' + pluginName);

    plugin.init(player, function() {
        player.plugins[pluginName] = plugin;
        console.log('plugin ' + pluginName + ' initialized');
    }, function(err) {
        console.log('error in ' + pluginName + ': ' + err);
        callHooks('onPluginInitError', [player, plugin]);
    });
});

// TODO: maybe wait for callbacks before this?
callHooks('onPluginsInitialized', [player]);

// init backends
_.each(config.backends, function(backendName) {
    // TODO: put backend modules into npm
    // must implement .search, .prepareSong, .init
    var backend = require('./backends/' + backendName);

    backend.init(player, function() {
        player.backends[backendName] = backend;

        console.log('backend ' + backendName + ' initialized');
        callHooks('onBackendInit', [player, backend]);
    }, function(err) {
        console.log('error in ' + backendName + ': ' + err);
        callHooks('onBackendInitError', [player, backend]);
    });
});

// TODO: maybe wait for callbacks before this?
callHooks('onBackendsInitialized', [player]);

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("ERROR! Node not exiting.");
});

