var express = require('express');
var bodyParser = require('body-parser');
var _ = require('underscore');

var partyplay = {};

partyplay.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    if(!player.expressApp) {
        errCallback('module must be initialized after expressjs module!');
    } else if(!player.socketio) {
        // partyplay client depends on socketio module
        errCallback('module must be initialized after socketio module!');
    } else if(!player.rest) {
        // partyplay client depends on rest module
        errCallback('module must be initialized after rest module!');
    } else {
        player.expressApp.use(express.static(__dirname + '/partyplay'));

        player.expressApp.post('/vote', bodyParser.json(), function(req, res) {
            var userID = req.body.userID;
            var vote = req.body.vote;
            var pos = req.body.pos;
            if(!userID || vote === undefined || !pos) {
                console.log('invalid vote rejected: missing fields');
                res.status(404).send('please provide userID, pos and vote in the body');
                return;
            } else if (pos <= 0) {
                console.log('invalid vote rejected: pos <= 0');
                res.status(404).send('please provide pos > 0');
                return;
            }

            var song = player.queue[pos];
            if(!song) {
                console.log('invalid vote rejected: song not found');
                res.status(404).send('song not found');
                return;
            }

            voteSong(song, vote, userID);
            player.onQueueModify();

            console.log('got vote ' + vote + ' for song: ' + song.songID);

            res.send('success');

        });

        // so other modules can easily see that this module is loaded
        player.partyplay = true;
        callback();
    }
};

partyplay.onPluginsInitialized = function() {
    // sortQueue should only be hooked to from one plugin at a time
    if(player.numHooks('sortQueue') > 1)
        console.log('partyplay: warning: more than one plugin hooks to sortQueue, expect weird behaviour');
};


// remove extremely downvoted (bad) songs
partyplay.onSongEnd = function(nowPlaying) {
    for (var i = player.queue.length - 1; i >= 0; i--) {
        // bump oldness parameter for all queued songs at song switch
        player.queue[i].oldness++;

        var numDownVotes = Object.keys(player.queue[i].downVotes).length;
        var numUpVotes = Object.keys(player.queue[i].upVotes).length;
        var totalVotes = numDownVotes + numUpVotes;
        if(numDownVotes / totalVotes >= config.badVotePercent) {
            console.log('song ' + player.queue[i].songID + ' removed due to downvotes');
            player.removeFromQueue(player.queue[i].backendName, player.queue[i].songID);
        }
    }
};

var checkDuration = function(song) {
    // check duration of song
    if(song.duration > config.songMaxDuration) {
        return "partyplay: song duration too long";
    }
}

partyplay.preSongQueued = function(song) {
    // if same song is already queued, don't create a duplicate
    var queuedSong = player.searchQueue(song.backendName, song.songID);
    if(queuedSong) {
        console.log('not adding duplicate song to queue: ' + queuedSong.songID);
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
partyplay.preAddSearchResult = function(player, song) {
    if(checkDuration(song)) {
        return checkDuration(song);
    }
};

// sort queue according to votes
partyplay.sortQueue = function() {
    var np;
    if(player.queue.length)
        np = player.queue.shift();

    player.queue.sort(function(a, b) {
        var aVotes = a.oldness + Object.keys(a.upVotes).length - Object.keys(a.downVotes).length;
        var bVotes = b.oldness + Object.keys(b.upVotes).length - Object.keys(b.downVotes).length;
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

module.exports = partyplay;
