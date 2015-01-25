var _ = require('underscore');
var async = require('async');

var userConfig = require(process.env.HOME + '/.partyplayConfig.js');
var defaultConfig = require(__dirname + '/partyplayConfigDefaults.js');
var config = _.defaults(userConfig, defaultConfig);

var player = {
    config: config,
    playedQueue: [],
    queue: [],
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
    var np = player.queue[0];
    console.log('playing song: ' + np.songID);

    np.playbackStart = new Date();
    player.npIsPlaying = true; // TODO: is there a better solution?

    callHooks('onSongChange', [player]);

    var duration = parseInt(np.duration) + config.songDelayMs;
    if(player.songEndTimeout) {
        console.log('DEBUG: songEndTimeout was cleared');
        clearTimeout(player.songEndTimeout);
    }
    player.songEndTimeout = setTimeout(function() {
        console.log('end of song ' + np.songID);
        callHooks('onSongEnd', [player]);

        player.playedQueue.push(player.queue[0]);

        player.npIsPlaying = false;
        player.queue[0] = null;
        player.songEndTimeout = null;
        onQueueModify();
    }, duration);
};

var prepareError = function(song, pos, err) {
    console.log('DEBUG: error! (' + err + ') removing song from queue: ' + song.songID);
    removeFromQueue(pos);

    callHooks('onSongPrepareError', [player]); // TODO: consider changing player to song?
    onQueueModify(); // if this was now playing we need to find another song
};

player.songsPreparing = {};
var prepareSong = function(song, pos, asyncCallback) {
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
            prepareError(song, pos, err);

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
            if(player.queue[0]) {
                prepareSong(player.queue[0], 0, function(err) {
                    // when done preparing now playing, run prepareSongs again
                    // next event loop in case now playing song has changed
                    // since we started preparing it
                    if (!err && player.queue[0] && player.queue[0].prepared && !player.npIsPlaying)
                        startPlayback();

                    callback(err);
                });
            } else {
                callback(true);
            }
        },
        function(callback) {
            // prepare next song in queue if it exists and if not prepared
            if(player.queue[1]) {
                prepareSong(player.queue[1], 1, callback);
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

    // set next song as now playing, moves current into playedQueue
    if(!player.queue[0])
        player.playedQueue.push(player.queue.shift());

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

    return null;
};
player.searchQueue = searchQueue;

// get rid of song in either queue (negative signifies playedQueue)
var removeFromQueue = function(pos, cnt) {
    var retval;
    if(!cnt)
        cnt = 1;

    pos = parseInt(pos);
    if(pos < 0)
        retval = player.playedQueue.splice(player.playedQueue.length + pos, cnt);

    callHooks('preSongsRemoved', [player, pos, cnt]);
    if(pos + cnt > 0) {
        if(pos >= 0) {
            retval = player.queue.splice(pos, cnt);
        } else {
            // pos is negative
            retval = player.queue.splice(0, cnt + pos);
        }

        if(pos <= 0) {
            // now playing was deleted
            player.npIsPlaying = false;
            clearTimeout(player.songEndTimeout);
            player.songEndTimeout = null;
        }
    }

    onQueueModify();
    callHooks('postSongsRemoved', [player, pos, cnt]);
    return retval;
};
player.removeFromQueue = removeFromQueue;

// add songs to the queue, at optional position
//
// metadata is optional and can contain information passed between plugins
// (e.g. which user added a song)
var addToQueue = function(songs, pos, metadata) {
    if(!pos || pos < 0)
        pos = 0;
    pos = Math.min(pos, player.queue.length)

    _.each(songs, function(song) {
        console.log('DEBUG: addToQueue(): ' + song.songID);
        // check that required fields are provided
        if(!song.title || !song.songID || !song.backendName || !song.duration) {
            console.log('required song fields not provided: ' + song.songID);
            return 'required song fields not provided';
        }

        var err = callHooks('preSongQueued', [player, song, metadata]);
        if(err)
            return err;

        song.playbackStart = null; // TODO: is this ever used...
        song.timeAdded = new Date().getTime();

        player.queue.splice(pos++, 0, song);
        console.log('added song to queue: ' + song.songID);
        callHooks('postSongQueued', [player, song, metadata]);
    })

    callHooks('sortQueue', [player, metadata]);
    onQueueModify();
    callHooks('postSongsQueued', [player, songs, metadata]);
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

