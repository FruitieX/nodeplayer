var express = require('express');
var bodyParser = require('body-parser');

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
            var songID = req.body.songID;
            var backendName = req.body.backendName;
            if(!userID || vote === undefined || !songID || !backendName) {
                console.log('invalid vote rejected: missing fields');
                res.status(404).send('please provide userID, songID, backendName and vote in the body');
                return;
            }

            var queuedSong = player.searchQueue(backendName, songID);
            if(!queuedSong) {
                console.log('invalid vote rejected: song not found');
                res.status(404).send('song not found');
                return;
            }

            voteSong(queuedSong, vote, userID);
            player.onQueueModify();
            player.socketio.io.emit('queue', [player.nowPlaying, player.queue]);

            console.log('got vote ' + vote + ' for song: ' + queuedSong.songID);

            res.send('success');
        });

    }

    callback();
};

partyplay.onPluginsInitialized = function(player) {
    // sortQueue should only be hooked to from one plugin at a time
    if(player.numHooks('sortQueue') > 1)
        console.log('partyplay: warning: more than one plugin hooks to sortQueue, expect weird behaviour');
};

// automatically add an upvote after user has added a song
partyplay.postSongQueued = function(player, song, metadata) {
    voteSong(song, +1, metadata.userID);
};

// remove extremely downvoted (bad) songs
partyplay.onSongEnd = function(player) {
    for (var i = player.queue.length - 1; i >= 0; i--) {
        // bump oldness parameter for all queued songs at song switch
        player.queue[i].oldness++;

        var numDownVotes = Object.keys(player.queue[i].downVotes).length;
        var numUpVotes = Object.keys(player.queue[i].upVotes).length;
        var totalVotes = numDownVotes + numUpVotes;
        if(numDownVotes / totalVotes > config.badVotePercent) {
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

partyplay.preSongQueued = function(player, song, metadata) {
    if(checkDuration(song)) {
        return checkDuration(song);
    }
    else if(!metadata.userID) {
        // TODO: actually validate the ID?
        // check valid ID
        return 'invalid userID';
    } else {
        // initialize song fields used by partyplay
        song.upVotes = {};
        song.downVotes = {};
        song.oldness = 0; // favor old songs
    }
};
partyplay.preAddSearchResult = function(player, song) {
    if(checkDuration(song)) {
        return checkDuration(song);
    }
};

// sort queue according to votes
partyplay.sortQueue = function(player) {
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
        song.downVotes[userID] = true;
    }

    player.callHooks('sortQueue', [player]);
};

module.exports = partyplay;
