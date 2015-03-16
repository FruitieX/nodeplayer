'use strict';

var _ = require('underscore');
var async = require('async');
var winston = require('winston');
var config = require('nodeplayer-defaults')();

function Player() {
    _.bindAll.apply(_, [this].concat(_.functions(this)));
    this.config = config;
    this.logger = logger;
    this.playedQueue = []; // TODO: don't let this grow to infinity
    this.queue = [];
    this.plugins = {};
    this.backends = {};
    this.songsPreparing = {};
    this.volume = 1;
    this.songEndTimeout = null;
}

function newLogger(label) {
    return new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({
                label: label,
                level: config.logLevel,
                colorize: config.logColorize,
                handleExceptions: config.logExceptions,
                json: config.logJson
            })
        ]
    });
};

var logger = newLogger('core');

// call hook function in all modules
// if any hooks return a truthy value, it is an error and we abort
// be very careful with calling hooks from within a hook, infinite loops are possible
Player.prototype.callHooks = function(hook, argv) {
    // _.find() used instead of _.each() because we want to break out as soon
    // as a hook returns a truthy value (used to indicate an error, e.g. in form
    // of a string)
    var err = null;

    logger.silly('callHooks(' + hook + ', ' + JSON.stringify(argv, undefined, 4) + ')');

    _.find(this.plugins, function(plugin) {
        if(plugin[hook]) {
            err = plugin[hook].apply(null, argv);
            return err;
        }
    });

    return err;
};

// returns number of hook functions attached to given hook
Player.prototype.numHooks = function(hook) {
    var cnt = 0;

    _.find(this.plugins, function(plugin) {
        if(plugin[hook]) {
            cnt++;
        }
    });

    return cnt;
};

Player.prototype.endOfSong = function() {
    var np = this.queue[0];

    logger.info('end of song ' + np.songID);
    this.callHooks('onSongEnd', [np]);

    this.playedQueue.push(this.queue[0]);

    this.playbackPosition = null;
    this.playbackStart = null;
    this.queue[0] = null;
    this.songEndTimeout = null;
    this.onQueueModify();
};

// start or resume playback of now playing song.
// if pos is undefined, playback continues (or starts from 0 if !playbackPosition)
Player.prototype.startPlayback = function(pos) {
    var np = this.queue[0];
    if(!np) {
        logger.verbose('startPlayback called, but hit end of queue');
        return;
    }

    if(pos)
        logger.info('playing song: ' + np.songID + ', from pos: ' + pos);
    else
        logger.info('playing song: ' + np.songID);

    var oldPlaybackStart = this.playbackStart;
    this.playbackStart = new Date().getTime(); // song is playing while this is truthy

    // where did the song start playing from at playbackStart?
    if(!_.isUndefined(pos))
        this.playbackPosition = pos;
    else if(!this.playbackPosition)
        this.playbackPosition = 0;

    if(oldPlaybackStart)
        this.callHooks('onSongSeek', [np]);
    else
        this.callHooks('onSongChange', [np]);

    var durationLeft = parseInt(np.duration) - this.playbackPosition + config.songDelayMs;
    if(this.songEndTimeout) {
        logger.debug('songEndTimeout was cleared');
        clearTimeout(this.songEndTimeout);
    }
    this.songEndTimeout = setTimeout(this.endOfSong, durationLeft);
};

Player.prototype.pausePlayback = function() {
    // update position
    this.playbackPosition += new Date().getTime() - this.playbackStart;
    this.playbackStart = null;

    clearTimeout(this.songEndTimeout);
    this.songEndTimeout = null;
    this.callHooks('onSongPause', [this.nowPlaying]);
};

Player.prototype.prepareError = function(song, err) {
    // remove all instances of this song
    for(var i = this.queue.length - 1; i >= 0; i--) {
        if(this.queue[i].songID === song.songID && this.queue[i].backendName === song.backendName) {
            if(!song.beingDeleted) {
                logger.error('preparing song failed! (' + err + '), removing from queue: ' + song.songID);
                this.removeFromQueue(i);
            }
        }
    }

    this.callHooks('onSongPrepareError', [song, err]);
};

Player.prototype.prepareProgCallback = function(song, dataSize, done) {
    /* progress callback
     * when this is called, new song data has been flushed to disk */

    // start playback if it hasn't been started yet
    if (this.queue[0]
        && this.queue[0].backendName === song.backendName
        && this.queue[0].songID === song.songID
        && !this.playbackStart
        && dataSize)
    {
        this.startPlayback();
    }

    if (done) {
        // mark song as prepared
        this.callHooks('onSongPrepared', [song]);

        // done preparing, can't cancel anymore
        delete(song.cancelPrepare);
        delete(this.songsPreparing[song.backendName][song.songID]);

        asyncCallback();
    }

    // tell plugins that new data is available for this song, and
    // whether the song is now fully written to disk or not.
    this.callHooks('onPrepareProgress', [song, dataSize, done]);
}

Player.prototype.prepareErrCallback = function(song, err) {
    /* error callback */

    // don't let anything run cancelPrepare anymore
    delete(song.cancelPrepare);

    // abort preparing more songs; current song will be deleted ->
    // onQueueModified is called -> song preparation is triggered again
    asyncCallback(true);

    this.prepareError(song, err);
    delete(this.songsPreparing[song.backendName][song.songID]);
}

// TODO: get rid of the callback hell, use promises?
Player.prototype.prepareSong = function(song, asyncCallback) {
    if(!song) {
        logger.debug('prepareSong() without song');
        asyncCallback(true);
        return;
    }

    if(this.backends[song.backendName].isPrepared(song)) {
        // start playback if it hasn't been started yet
        if (this.queue[0]
            && this.queue[0].backendName === song.backendName
            && this.queue[0].songID === song.songID
            && !this.playbackStart)
        {
            this.startPlayback();
        }

        // song is already prepared, ok to prepare more songs
        asyncCallback();
    } else if(this.songsPreparing[song.backendName][song.songID]) {
        // this song is already preparing, so don't yet prepare next song
        asyncCallback(true);
    } else {
        // song is not prepared and not currently preparing: let backend prepare it
        logger.debug('DEBUG: prepareSong() ' + song.songID);
        this.songsPreparing[song.backendName][song.songID] = song;

        song.cancelPrepare = this.backends[song.backendName].prepareSong(
            song.songID,
            this.prepareProgCallback,
            this.prepareErrCallback
        );
    }
};

// prepare now playing and queued songs for playback
Player.prototype.prepareSongs = function() {
    async.series([
        _.bind(function(callback) {
            // prepare now-playing song if it exists and if not prepared
            if(this.queue[0]) {
                this.prepareSong(this.queue[0], callback);
            } else {
                callback(true);
            }
        }, this),
        _.bind(function(callback) {
            // prepare next song in queue if it exists and if not prepared
            if(this.queue[1]) {
                this.prepareSong(this.queue[1], callback);
            } else {
                callback(true);
            }
        }, this)
    ]);
};

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - call prepareSongs()
Player.prototype.onQueueModify = function() {
    this.callHooks('preQueueModify', [this.queue]);

    // set next song as now playing
    if(!this.queue[0])
        this.queue.shift();

    // if the queue is now empty, do nothing
    if(!this.queue.length) {
        this.callHooks('onEndOfQueue');
        logger.info('end of queue, waiting for more songs');
    } else {
        this.prepareSongs();
    }
    this.callHooks('postQueueModify', [this.queue]);
};

// find song from queue
Player.prototype.searchQueue = function(backendName, songID) {
    for(var i = 0; i < this.queue.length; i++) {
        if(this.queue[i].songID === songID
                && this.queue[i].backendName === backendName)
            return this.queue[i];
    }

    return null;
};

// make a search query to backends
Player.prototype.searchBackends = function(query, callback) {
    var resultCnt = 0;
    var allResults = {};

    _.each(this.backends, _.bind(function(backend) {
        backend.search(query, _.bind(function(results) {
            resultCnt++;

            // make a temporary copy of songlist, clear songlist, check
            // each song and add them again if they are ok
            var tempSongs = _.clone(results.songs);
            allResults[backend.name] = results;
            allResults[backend.name].songs = {};

            _.each(tempSongs, _.bind(function(song) {
                var err = this.callHooks('preAddSearchResult', [song]);
                if(!err)
                    allResults[backend.name].songs[song.songID] = song;
                else
                    logger.error('preAddSearchResult hook error: ' + err);
            }, this));

            // got results from all services?
            if(resultCnt >= Object.keys(this.backends).length)
                callback(allResults);
        }, this), _.bind(function(err) {
            resultCnt++;
            logger.error('error while searching ' + backend.name + ': ' + err);

            // got results from all services?
            if(resultCnt >= Object.keys(this.backends).length)
                callback(allResults);
        }, this));
    }, this));
};

// get rid of song in either queue (negative signifies playedQueue)
// cnt can be left out for deleting only one song
Player.prototype.removeFromQueue = function(pos, cnt) {
    var retval;
    if(!cnt)
        cnt = 1;

    pos = parseInt(pos);
    this.callHooks('preSongsRemoved', [pos, cnt]);

    // remove songs from played queue
    if(pos < 0)
        retval = this.playedQueue.splice(this.playedQueue.length + pos, cnt);

    // remove songs from queue
    if(pos + cnt > 0) {
        if(this.queue.length) {
            // stop preparing songs we are about to remove
            // we want to limit this to this.queue.length if cnt is very large
            for(var i = 0; i < Math.min(this.queue.length, pos + cnt); i++) {
                var song = this.queue[i];

                // signal prepareError function not to run removeFromQueue again
                song.beingDeleted = true;
                if(song.cancelPrepare) {
                    song.cancelPrepare('song deleted');
                    delete(song.cancelPrepare);
                }
            }

            if(pos >= 0) {
                retval = this.queue.splice(pos, cnt);
            } else {
                // pos is negative: removed some from played queue, continue removing from zero
                retval = this.queue.splice(0, cnt + pos);
            }

            if(pos <= 0) {
                // now playing was deleted
                this.playbackPosition = null;
                this.playbackStart = null;
                clearTimeout(this.songEndTimeout);
                this.songEndTimeout = null;
            }
        }
    }

    this.onQueueModify();
    this.callHooks('postSongsRemoved', [pos, cnt]);
    return retval;
};

// add songs to the queue, at optional position
Player.prototype.addToQueue = function(songs, pos) {
    if(!pos || pos < 0)
        pos = this.queue.length;
    pos = Math.min(pos, this.queue.length)

    this.callHooks('preSongsQueued', [songs, pos]);
    _.each(songs, function(song) {
        // check that required fields are provided
        if(!song.title || !song.songID || !song.backendName || !song.duration) {
            logger.info('required song fields not provided: ' + song.songID);
            return 'required song fields not provided';
        }

        var err = this.callHooks('preSongQueued', [song]);
        if(err) {
            logger.error('not adding song to queue: ' + err);
        } else {
            song.timeAdded = new Date().getTime();

            this.queue.splice(pos++, 0, song);
            logger.info('added song to queue: ' + song.songID);
            this.callHooks('postSongQueued', [song]);
        }
    })

    this.callHooks('sortQueue');
    this.onQueueModify();
    this.callHooks('postSongsQueued', [songs, pos]);
};

Player.prototype.shuffleQueue = function() {
    // don't change now playing
    var temp = this.queue.shift();
    this.queue = _.shuffle(this.queue);
    this.queue.unshift(temp);

    this.callHooks('onQueueShuffled', [this.queue]);
    this.onQueueModify();
};

// cnt can be negative to go back or zero to restart current song
Player.prototype.skipSongs = function(cnt) {
    this.npIsPlaying = false;

    for(var i = 0; i < Math.abs(cnt); i++) {
        if(cnt > 0) {
            if(this.queue[0])
                this.playedQueue.push(this.queue[0]);

            this.queue.shift();
        } else if(cnt < 0) {
            if(this.playedQueue.length)
                this.queue.unshift(this.playedQueue.pop());
        }

        // ran out of songs while skipping, stop
        if(!this.queue[0])
            break;
    }

    this.playbackPosition = null;
    this.playbackStart = null;
    clearTimeout(this.songEndTimeout);
    this.songEndTimeout = null;
    this.onQueueModify();
};

Player.prototype.setVolume = function(newVol, userID) {
    newVol = Math.min(1, Math.max(0, newVol));
    this.volume = newVol;
    this.callHooks('onVolumeChange', [newVol, userID]);
};

function checkModule(module) {
	try {
		require.resolve(module);
	} catch(e) {
		logger.error('Cannot find module: ' + module);
		process.exit(e.code);
	}
};

var player = new Player();

// init plugins
async.each(config.plugins, function(pluginName, callback) {
    // TODO: put plugin modules into npm
    // must implement .init, can implement hooks
	var pluginFile = './plugins/' + pluginName;
	checkModule(pluginFile);
    var plugin = require('./plugins/' + pluginName);

    var pluginLogger = newLogger(pluginName);
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

    var backendLogger = newLogger(backendName);
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
