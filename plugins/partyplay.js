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

        player.expressApp.post('/vote/:id', bodyParser.json(), function(req, res) {
            var userID = req.body.userID;
            var vote = req.body.vote;
            var songID = req.params.id;
            if(!userID || vote === undefined || !songID) {
                res.status(404).send('please provide both userID and vote in the body');
            }

            var queuedSong = player.searchQueue(songID);
            if(!queuedSong) {
                res.status(404).send('song not found');
            }

            voteSong(queuedSong, vote, userID);
            player.onQueueModify();
            io.emit('queue', [player.nowPlaying, player.queue]);

            console.log('got vote ' + vote + ' for song: ' + queuedSong.id);

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

// check that song was added by valid user ID
partyplay.preSongQueued = function(player, song, metadata) {
    // TODO: actually validate the ID?
    if(!metadata.userID) {
        return 'invalid userID';
    }
};

// automatically add an upvote after user has added a song
partyplay.postSongQueued = function(player, song, metadata) {
    voteSong(song, +1, metadata.userID);
};

// remove extremely downvoted (bad) songs
partyplay.onSongEnd = function(player) {
    for (var i = player.queue.length - 1; i >= 0; i--) {
        player.queue[i].oldness++;

        var numDownVotes = Object.keys(player.queue[i].downVotes).length;
        var numUpVotes = Object.keys(player.queue[i].upVotes).length;
        var totalVotes = numDownVotes + numUpVotes;
        if(numDownVotes / totalVotes > config.badVotePercent) {
            console.log('song ' + player.queue[i].id + ' removed due to downvotes');
            player.removeFromQueue(player.queue[i].id);
        }
    }
};

// check duration of song
partyplay.preSongQueued = function(player, song, metadata) {
    if(song.duration > config.songMaxDuration) {
        return "partyplay: song duration too long";
    }
};
partyplay.preAddSearchResult = partyplay.preSongQueued;

// sort queue according to votes
partyplay.sortQueue = function(player) {
    player.queue.sort(function(a, b) {
        return ((b.oldness + Object.keys(b.upVotes).length - Object.keys(b.downVotes).length) -
               (a.oldness + Object.keys(a.upVotes).length - Object.keys(a.downVotes).length));
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
