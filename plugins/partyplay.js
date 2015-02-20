"use strict";

var express = require('express');
var bodyParser = require('body-parser');
var _ = require('underscore');

var player, config, logger;

exports.init = function(_player, _logger, callback) {
    player = _player;
    config = _player.config;
    logger = _logger;

    if(!player.app) {
        callback('module must be initialized after expressjs module!');
    } else if(!player.plugins.socketio) {
        // partyplay client depends on socketio module
        callback('module must be initialized after socketio module!');
    } else if(!player.plugins.rest) {
        // partyplay client depends on rest module
        callback('module must be initialized after rest module!');
    } else {
        player.app.use('/partyplay', express.static(__dirname + '/partyplay'));

        player.app.post('/vote', bodyParser.json(), function(req, res) {
            var userID = req.body.userID;
            var vote = req.body.vote;
            var pos = req.body.pos;
            if(!userID || vote === undefined || !pos) {
                logger.info('invalid vote rejected: missing fields');
                res.status(404).send('please provide userID, pos and vote in the body');
                return;
            } else if (pos <= 0) {
                logger.info('invalid vote rejected: pos <= 0');
                res.status(404).send('please provide pos > 0');
                return;
            }

            var song = player.queue[pos];
            if(!song) {
                logger.info('invalid vote rejected: song not found');
                res.status(404).send('song not found');
                return;
            }

            voteSong(song, vote, userID);
            player.onQueueModify();

            logger.info('got vote ' + vote + ' for song: ' + song.songID);

            res.send('success');

        });

        callback();
    }
};

exports.onPluginsInitialized = function() {
    // sortQueue should only be hooked to from one plugin at a time
    if(player.numHooks('sortQueue') > 1)
        logger.warn('more than one plugin hooks to sortQueue, expect weird behaviour');
};


// remove extremely downvoted (bad) songs
exports.onSongEnd = function(nowPlaying) {
    for (var i = player.queue.length - 1; i >= 0; i--) {
        // bump oldness parameter for all queued songs at song switch
        player.queue[i].oldness++;

        var numDownVotes = Object.keys(player.queue[i].downVotes || {}).length;
        var numUpVotes = Object.keys(player.queue[i].upVotes || {}).length;
        var totalVotes = numDownVotes + numUpVotes;
        if(numDownVotes / totalVotes >= config.badVotePercent) {
            logger.info('song ' + player.queue[i].songID + ' removed due to downvotes');
            player.removeFromQueue(player.queue[i].backendName, player.queue[i].songID);
        }
    }
};

var checkDuration = function(song) {
    // check duration of song
    if(song.duration > config.songMaxDuration) {
        return '[partyplay] song duration ' + song.duration + ' too long, max: ' + config.songMaxDuration;
    }
}

exports.preSongQueued = function(song) {
    // if same song is already queued, don't create a duplicate
    var queuedSong = player.searchQueue(song.backendName, song.songID);
    if(queuedSong) {
        logger.info('not adding duplicate song to queue: ' + queuedSong.songID);
        return 'duplicate songID';
    }

    if(checkDuration(song)) {
        return checkDuration(song);
    }
    else if(!song.userID) {
        // TODO: actually validate the ID?
        // check valid ID
        return 'invalid userID';
    } else {
        // initialize song fields used by partyplay
        song.upVotes = {};
        song.downVotes = {};
        song.oldness = 0; // favor old songs

        // automatically add an upvote after user has added a song
        voteSong(song, +1, song.userID);
    }
};
exports.preAddSearchResult = function(song) {
    if(checkDuration(song)) {
        return checkDuration(song);
    }
};

// sort queue according to votes
exports.sortQueue = function() {
    var np;
    if(player.queue.length)
        np = player.queue.shift();

    player.queue.sort(function(a, b) {
        var aVotes = a.oldness + Object.keys(a.upVotes || {}).length - Object.keys(a.downVotes || {}).length;
        var bVotes = b.oldness + Object.keys(b.upVotes || {}).length - Object.keys(b.downVotes || {}).length;
        if(aVotes !== bVotes)
            // ordering first determined by votes + oldness
            return (bVotes - aVotes);
        else
            // if votes equal, prioritize song that has waited longer
            return a.timeAdded - b.timeAdded;
    });
    if(np)
        player.queue.unshift(np);
};

var voteSong = function(song, vote, userID) {
    // normalize vote to -1, 0, 1
    vote = parseInt(vote);

    if(vote)
        vote = vote / Math.abs(vote);
    else
        vote = 0;

    if(!song.upVotes)
        song.upVotes = {};
    if(!song.downVotes)
        song.downVotes = {};

    if(!vote) {
        delete(song.upVotes[userID]);
        delete(song.downVotes[userID]);
    } else if (vote > 0) {
        delete(song.downVotes[userID]);
        song.upVotes[userID] = true;
    } else if (vote < 0) {
        delete(song.upVotes[userID]);
        // TODO: more downvotes than only one?
        // users only have one downvote to prevent abuse
        var np;
        if(player.queue.length)
            np = player.queue.shift();

        _.each(player.queue, function(queueSong) {
            delete(queueSong.downVotes[userID]);
        });

        if(np)
            player.queue.unshift(np);
        song.downVotes[userID] = true;
    }

    player.callHooks('sortQueue');
};
