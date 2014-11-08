var config = require(process.env.HOME + '/.partyplayConfig.js');
//var defaultConfig = require(__dirname + '/partyplayConfigDefaults.js');

var http = require('http');

var fs = require('fs');
var mkdirp = require('mkdirp');
if(!fs.existsSync(config.songCachePath))
    mkdirp.sync(config.songCachePath);

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var ipfilter = require('express-ipfilter');

var queue = [];
var nowPlaying;

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - prepare first and second songs in the queue
var queueCheck = function() {
    if(!queue.length) {
        console.log('end of queue, waiting for more songs');
        return;
    }

    var startPlayingNext = false;
    if(!nowPlaying) {
        // play song
        nowPlaying = queue.shift();
        cleanupSong(nowPlaying.id);
        startPlayingNext = true;

        for (var i = queue.length - 1; i >= 0; i--) {
            queue[i].oldness++;

            // remove bad songs
            var numDownVotes = Object.keys(queue[i].downVotes).length;
            var numUpVotes = Object.keys(queue[i].upVotes).length;
            var totalVotes = numDownVotes + numUpVotes;
            if(numDownVotes / totalVotes > config.badVotePercent) {
                console.log('song ' + queue[i].id + ' removed due to downvotes');
                cleanupSong(queue[i].id);
            }
        }
    }

    // TODO: error handling if backends[...] is undefined
    // prepare now playing song
    backends[nowPlaying.backend].prepareSong(nowPlaying.id, function() {
        if(startPlayingNext) {
            console.log('playing song: ' + nowPlaying.id);

            io.emit('playback', {
                songID: nowPlaying.id,
                backend: nowPlaying.backend,
                duration: nowPlaying.duration
            });
            nowPlaying.playbackStart = new Date();

            var songTimeout = parseInt(nowPlaying.duration) + config.songDelayMs;
            setTimeout(function() {
                console.log('end of song ' + nowPlaying.id);
                nowPlaying = null;
                queueCheck();
                io.emit('queue', [nowPlaying, queue]);
            }, songTimeout);
        }

        // prepare next song in queue
        if(queue.length) {
            backends[queue[0].backend].prepareSong(queue[0].id, function() {
                console.log('successfully prepared ' + queue[0].id);
            }, function(err) {
                console.log(err);
                cleanupSong(queue[0].id);
            });
        } else {
            console.log('no songs in queue to prepare');
        }
    }, function(err) {
        console.log(err);
        cleanupSong(nowPlaying.id);
    });
};

// sort queue according to votes and oldness
var sortQueue = function() {
    queue.sort(function(a, b) {
        return ((b.oldness + Object.keys(b.upVotes).length - Object.keys(b.downVotes).length) -
               (a.oldness + Object.keys(a.upVotes).length - Object.keys(a.downVotes).length));
    });
};

// find song from queue
var searchQueue = function(songID) {
    for(var i = 0; i < queue.length; i++) {
        if(queue[i].id === songID)
            return queue[i];
    }

    if(nowPlaying && nowPlaying.id === songID)
        return nowPlaying;

    return null;
};

// get rid of song in queue
var cleanupSong = function(songID) {
    for(var i = 0; i < queue.length; i++) {
        if(queue[i].id === songID) {
            queue.splice(i, 1);
            return;
        }
    }
};

// initialize song object
var initializeSong = function(song) {
    song.upVotes = {};
    song.downVotes = {};
    song.oldness = 0; // favor old songs
    song.playbackStart = null;

    queue.push(song);
    return song;
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

    sortQueue();
};

app.post('/vote/:id', bodyParser.json(), function(req, res) {
    var userID = req.body.userID;
    var vote = req.body.vote;
    var songID = req.params.id;
    if(!userID || vote === undefined || !songID) {
        res.status(404).send('please provide both userID and vote in the body');
    }

    var queuedSong = searchQueue(songID);
    if(!queuedSong) {
        res.status(404).send('song not found');
    }

    voteSong(queuedSong, vote, userID);
    queueCheck();
    io.emit('queue', [nowPlaying, queue]);

    console.log('got vote ' + vote + ' for song: ' + queuedSong.id);

    res.send('success');
});

// get entire queue
app.get('/queue', function(req, res) {
    var response = [];
    if(nowPlaying) {
        response.push({
            artist: nowPlaying.artist,
            title: nowPlaying.title,
            duration: nowPlaying.duration,
            id: nowPlaying.id,
            downVotes: nowPlaying.downVotes,
            upVotes: nowPlaying.upVotes,
            oldness: nowPlaying.oldness
        });
    }
    for(var i = 0; i < queue.length; i++) {
        response.push({
            artist: queue[i].artist,
            title: queue[i].title,
            duration: queue[i].duration,
            id: queue[i].id,
            downVotes: queue[i].downVotes,
            upVotes: queue[i].upVotes,
            oldness: queue[i].oldness
        });
    }
    res.send(JSON.stringify(response));
});

// queue song
app.post('/queue', bodyParser.json(), function(req, res) {
    var song = req.body.song;

    // check that required fields are provided
    if(!song.title || !song.id || !song.duration) {
        res.status(404).send('invalid song object');
    }

    // check that user has an id
    var userID = req.body.userID;
    if(!userID) {
        res.status(404).send('invalid userID');
    }

    // if same song is already queued, don't create a duplicate
    var queuedSong = searchQueue(song.id);

    // no duplicate found, initialize a few properties of song
    if(!queuedSong)
        queuedSong = initializeSong(song);

    // new song automatically gets upvote by whoever added it
    voteSong(queuedSong, +1, userID);

    queueCheck();

    console.log('added song to queue: ' + queuedSong.id);
    io.emit('queue', [nowPlaying, queue]);
    res.send('success');
});

// search for song with given search terms
app.get('/search/:terms', function(req, res) {
    console.log('got search request: ' + req.params.terms);

    for(var backend in backends) {
        backends[backend].search(req.params.terms, function(songs) {
            res.send(JSON.stringify(songs));
        }, function(err) {
            console.log(err);
            res.status(404).send(err);
        });
    }
});

var server = app.listen(process.env.PORT || 8080);
var io = require('socket.io')(server);
io.on('connection', function(socket) {
    if(nowPlaying) {
        socket.emit('playback', {
            songID: nowPlaying.id,
            backend: nowPlaying.backend,
            duration: nowPlaying.duration,
            position: new Date() - nowPlaying.playbackStart
        });
    }
    socket.emit('queue', [nowPlaying, queue]);
});

console.log('listening on port ' + (process.env.PORT || 8080));

var checkIP = ipfilter(config.streamIPs, {mode: 'allow', log: config.log});
app.use('/song', checkIP);

// init backends
var backends = {};
for(var i = 0; i < config.backendServices.length; i++) {
    // TODO: put backend modules into npm
    var backend = require('./backends/' + config.backendServices[i]);
    var backendName = config.backendServices[i];

    backend.init(config, function() {
        console.log('backend ' + backendName + ' initialized');
    });

    backends[backendName] = {};
    backends[backendName].prepareSong = backend.prepareSong;
    backends[backendName].search = backend.search;
    app.use('/song/' + backendName, backend.middleware);
}

app.use(express.static(__dirname + '/public'));
