'use strict';

var _ = require('underscore');
var async = require('async');

var checkModule = function(module) {
	try {
		require.resolve(module);
	} catch(e) {
		console.error('Cannot find module: ' + module);
		process.exit(e.code);
	}
};

var getConfigPath = function(config) {
	if (process.platform == 'win32')
		return process.env.USERPROFILE + '\\nodeplayer\\' + config;
	else
		return process.env.HOME + '/.' + config;
};

checkModule('nodeplayer-defaults');
var defaultConfig = require('nodeplayer-defaults');
var userConfigFile = getConfigPath('nodeplayer-config.js');
var config = defaultConfig;
try {
	var userConfig = require(userConfigFile);
	config = _.defaults(userConfig, defaultConfig);
} catch(e) {
	console.warn("Warning! Using default configurations: " + require.resolve('nodeplayer-defaults'));
	console.warn("Couldn't find user configurations: " + userConfigFile);
}

var player = {
    config: config,
    playedQueue: [], // TODO: don't let this grow to infinity
    queue: [],
    plugins: {},
    backends: {},
    songsPreparing: {}
};

// call hook function in all modules
// if any hooks return a truthy value, it is an error and we abort
// be very careful with calling hooks from within a hook, infinite loops are possible
var callHooks = function(hook, argv) {
    // _.find() used instead of _.each() because we want to break out as soon
    // as a hook returns a truthy value (used to indicate an error, e.g. in form
    // of a string)
    var err = null;

    _.find(player.plugins, function(plugin) {
        if(plugin[hook]) {
            err = plugin[hook].apply(null, argv);
            return err;
        }
    });

    return err;
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

// start or resume playback of now playing song.
// if pos is undefined, playback continues (or starts from 0 if !playbackPosition)
player.songEndTimeout = null;
var startPlayback = function(pos) {
    var np = player.queue[0];
    if(pos)
        console.log('playing song: ' + np.songID + ', from pos: ' + pos);
    else
        console.log('playing song: ' + np.songID);

    player.playbackStart = new Date().getTime(); // song is playing while this is truthy

    // where did the song start playing from at playbackStart?
    if(!_.isUndefined(pos))
        player.playbackPosition = pos;
    else if(!player.playbackPosition)
        player.playbackPosition = 0;

    callHooks('onSongChange', [np]);

    var durationLeft = parseInt(np.duration) - player.playbackPosition + config.songDelayMs;
    if(player.songEndTimeout) {
        console.log('DEBUG: songEndTimeout was cleared');
        clearTimeout(player.songEndTimeout);
    }
    player.songEndTimeout = setTimeout(function() {
        console.log('end of song ' + np.songID);
        callHooks('onSongEnd', [np]);

        player.playedQueue.push(player.queue[0]);

        player.playbackPosition = null;
        player.playbackStart = null;
        player.queue[0] = null;
        player.songEndTimeout = null;
        onQueueModify();
    }, durationLeft);
};
player.startPlayback = startPlayback;

var pausePlayback = function() {
    // update position
    player.playbackPosition += new Date().getTime() - player.playbackStart;
    player.playbackStart = null;

    clearTimeout(player.songEndTimeout);
    player.songEndTimeout = null;
    callHooks('onSongPause', [player.nowPlaying]);
};
player.pausePlayback = pausePlayback;

var prepareError = function(song, err) {
    // remove all instances of this song
    for(var i = player.queue.length - 1; i >= 0; i--) {
        if(player.queue[i].songID === song.songID && player.queue[i].backendName === song.backendName) {
            if(!song.beingDeleted) {
                console.log('DEBUG: error! (' + err + ') removing song from queue: ' + song.songID);
                removeFromQueue(i);
            }
        }
    }

    callHooks('onSongPrepareError', [song, err]);
};

// TODO: get rid of the callback hell, use promises?
var prepareSong = function(song, asyncCallback) {
    if(!song) {
        console.log('DEBUG: prepareSong() without song');
        asyncCallback(true);
        return;
    }

    if(player.backends[song.backendName].isPrepared(song.songID)) {
        // start playback if it hasn't been started yet
        if (player.queue[0]
            && player.queue[0].backendName === song.backendName
            && player.queue[0].songID === song.songID
            && !player.playbackStart)
        {
            startPlayback();
        }

        // song is already prepared, ok to prepare more songs
        asyncCallback();
    } else if(player.songsPreparing[song.backendName][song.songID]) {
        // this song is already preparing, so don't yet prepare next song
        asyncCallback(true);
    } else {
        // song is not prepared and not currently preparing: let backend prepare it
        //console.log('DEBUG: prepareSong() ' + song.songID);
        player.songsPreparing[song.backendName][song.songID] = song;

        song.cancelPrepare = player.backends[song.backendName].prepareSong(song.songID, function(dataSize, done) {
            /* progress callback
             * when this is called, new song data has been flushed to disk */

            // start playback if it hasn't been started yet
            if (player.queue[0]
                && player.queue[0].backendName === song.backendName
                && player.queue[0].songID === song.songID
                && !player.playbackStart
                && dataSize)
            {
                startPlayback();
            }

            if (done) {
                // mark song as prepared
                callHooks('onSongPrepared', [song]);

                // done preparing, can't cancel anymore
                delete(song.cancelPrepare);
                delete(player.songsPreparing[song.backendName][song.songID]);

                asyncCallback();
            }

            // tell plugins that new data is available for this song, and
            // whether the song is now fully written to disk or not.
            callHooks('onPrepareProgress', [song, dataSize, done]);

        }, function(err) {
            /* error callback */

            // don't let anything run cancelPrepare anymore
            delete(song.cancelPrepare);

            // abort preparing more songs; current song will be deleted ->
            // onQueueModified is called -> song preparation is triggered again
            asyncCallback(true);

            prepareError(song, err);
            delete(player.songsPreparing[song.backendName][song.songID]);
        });
    }
};

// prepare now playing and queued songs for playback
var prepareSongs = function() {
    async.series([
        function(callback) {
            // prepare now-playing song if it exists and if not prepared
            if(player.queue[0]) {
                prepareSong(player.queue[0], callback);
            } else {
                callback(true);
            }
        },
        function(callback) {
            // prepare next song in queue if it exists and if not prepared
            if(player.queue[1]) {
                prepareSong(player.queue[1], callback);
            } else {
                callback(true);
            }
        }
    ]);
};
player.prepareSongs = prepareSongs;

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - call prepareSongs()
var onQueueModify = function() {
    if(!player.queue.length) {
        callHooks('onEndOfQueue');
        console.log('end of queue, waiting for more songs');
        return;
    }

    // set next song as now playing, moves current into playedQueue
    if(!player.queue[0])
        player.playedQueue.push(player.queue.shift());

    prepareSongs();
    callHooks('onQueueModify', [player.queue]);
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

// make a search query to backends
var searchBackends = function(query, callback) {
    var resultCnt = 0;
    var allResults = {};

    _.each(player.backends, function(backend) {
        backend.search(query, function(results) {
            resultCnt++;

            // make a temporary copy of songlist, clear songlist, check
            // each song and add them again if they are ok
            var tempSongs = _.clone(results.songs);
            allResults[backend.name] = results;
            allResults[backend.name].songs = {};

            _.each(tempSongs, function(song) {
                var err = player.callHooks('preAddSearchResult', [song]);
                if(!err)
                    allResults[backend.name].songs[song.songID] = song;
            });

            // got results from all services?
            if(resultCnt >= Object.keys(player.backends).length)
                callback(allResults);
        }, function(err) {
            resultCnt++;
            console.log(err);

            // got results from all services?
            if(resultCnt >= Object.keys(player.backends).length)
                callback(allResults);
        });
    });
};
player.searchBackends = searchBackends;

// get rid of song in either queue (negative signifies playedQueue)
// cnt can be left out for deleting only one song
var removeFromQueue = function(pos, cnt) {
    var retval;
    if(!cnt)
        cnt = 1;

    pos = parseInt(pos);
    callHooks('preSongsRemoved', [pos, cnt]);

    // remove songs from played queue
    if(pos < 0)
        retval = player.playedQueue.splice(player.playedQueue.length + pos, cnt);

    // remove songs from queue
    if(pos + cnt > 0) {
        if(player.queue.length) {
            // stop preparing songs we are about to remove
            // we want to limit this to player.queue.length if cnt is very large
            for(var i = 0; i < Math.min(player.queue.length, pos + cnt); i++) {
                var song = player.queue[i];

                // signal prepareError function not to run removeFromQueue again
                song.beingDeleted = true;
                if(song.cancelPrepare) {
                    song.cancelPrepare('song deleted');
                    delete(song.cancelPrepare);
                }
            }

            if(pos >= 0) {
                retval = player.queue.splice(pos, cnt);
            } else {
                // pos is negative: removed some from played queue, continue removing from zero
                retval = player.queue.splice(0, cnt + pos);
            }

            if(pos <= 0) {
                // now playing was deleted
                player.playbackPosition = null;
                player.playbackStart = null;
                clearTimeout(player.songEndTimeout);
                player.songEndTimeout = null;
            }
        }
    }

    onQueueModify();
    callHooks('postSongsRemoved', [pos, cnt]);
    return retval;
};
player.removeFromQueue = removeFromQueue;

// add songs to the queue, at optional position
var addToQueue = function(songs, pos) {
    if(!pos || pos < 0)
        pos = player.queue.length;
    pos = Math.min(pos, player.queue.length)

    callHooks('preSongsQueued', [songs, pos]);
    _.each(songs, function(song) {
        //console.log('DEBUG: addToQueue(): ' + song.songID);
        // check that required fields are provided
        if(!song.title || !song.songID || !song.backendName || !song.duration) {
            console.log('required song fields not provided: ' + song.songID);
            return 'required song fields not provided';
        }

        var err = callHooks('preSongQueued', [song]);
        if(err) {
            console.log('ERROR: not adding song to queue: ' + err);
        } else {
            song.timeAdded = new Date().getTime();

            player.queue.splice(pos++, 0, song);
            console.log('added song to queue: ' + song.songID);
            callHooks('postSongQueued', [song]);
        }
    })

    callHooks('sortQueue');
    onQueueModify();
    callHooks('postSongsQueued', [songs, pos]);
};
player.addToQueue = addToQueue;

var shuffleQueue = function() {
    // don't change now playing
    var temp = player.queue.shift();
    player.queue = _.shuffle(player.queue);
    player.queue.unshift(temp);

    player.onQueueModify();
};
player.shuffleQueue = shuffleQueue;

// cnt can be negative to go back or zero to restart current song
var skipSongs = function(cnt) {
    player.npIsPlaying = false;

    for(var i = 0; i < Math.abs(cnt); i++) {
        if(cnt > 0) {
            if(player.queue[0])
                player.playedQueue.push(player.queue[0]);

            player.queue.shift();
        } else if(cnt < 0) {
            if(player.playedQueue.length)
                player.queue.unshift(player.playedQueue.pop());
        }

        // ran out of songs while skipping, stop
        if(!player.queue[0])
            break;
    }

    player.playbackPosition = null;
    player.playbackStart = null;
    clearTimeout(player.songEndTimeout);
    player.songEndTimeout = null;
    player.onQueueModify();
};
player.skipSongs = skipSongs;

// init plugins
async.each(config.plugins, function(pluginName, callback) {
    // TODO: put plugin modules into npm
    // must implement .init, can implement hooks
	var pluginFile = './plugins/' + pluginName;
	checkModule(pluginFile);
    var plugin = require('./plugins/' + pluginName);

    plugin.init(player, function(err) {
        if(!err) {
            // TODO: some plugins set player.plugin = blah; now, and we do this here.
            player.plugins[pluginName] = plugin;
            console.log('plugin ' + pluginName + ' initialized');
            callHooks('onPluginInitialized', [plugin]);
        } else {
            console.log('error in ' + pluginName + ': ' + err);
            callHooks('onPluginInitError', [plugin, err]);
        }
        callback(err);
    });
}, function(err) {
    callHooks('onPluginsInitialized');
});

// init backends
async.each(config.backends, function(backendName, callback) {
    var backendFile = 'nodeplayer-' + backendName;
	checkModule(backendFile);
    var backend = require('nodeplayer-' + backendName);

    backend.init(player, function(err) {
        if(!err) {
            player.backends[backendName] = backend;
            player.songsPreparing[backendName] = {};

            console.log('backend ' + backendName + ' initialized');
            callHooks('onBackendInitialized', [backend]);
        } else {
            console.log('error in ' + backendName + ': ' + err);
            callHooks('onBackendInitError', [backend, err]);
        }
        callback(err);
    });
}, function(err) {
    callHooks('onBackendsInitialized');
    console.log('ready');
});

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("ERROR! Node not exiting.");
});

