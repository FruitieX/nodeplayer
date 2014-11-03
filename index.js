var PlayMusic = require('playmusic');
var creds = require(process.env.HOME + '/.googlePlayCreds.json');

var https = require('https');
var http = require('http');

var songCachePath = __dirname + '/songCache';
var fs = require('fs');
if(!fs.existsSync(songCachePath))
    fs.mkdirSync(songCachePath);

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var probe = require('node-ffprobe');

var gmusicDownload = function(startUrl, songID, callback, errCallback) {
    var doDownload = function(streamUrl) {
        console.log('downloading song ' + songID);
        var filePath = songCachePath + '/' + songID;
        var songFd = fs.openSync(filePath, 'w');

        var req = https.request(streamUrl, function(res) {

            res.on('data', function(chunk) {
                fs.writeSync(songFd, chunk, 0, chunk.length, null);
                //player.stdin.write(chunk);
            });
            res.on('end', function() {
                if(res.statusCode === 302) { // redirect
                    console.log('redirected. retrying with new URL');
                    fs.closeSync(songFd);
                    fs.unlinkSync(songCachePath + '/' + songID);
                    gmusicDownload(res.headers.location, songID, callback, errCallback);
                } else if(res.statusCode === 200) {
                    console.log('download finished ' + songID);
                    fs.closeSync(songFd);
                    if(callback)
                        callback(songID);
                    //player.stdin.end();
                } else {
                    console.log('ERROR: unknown status code ' + res.statusCode);
                    fs.closeSync(songFd);
                    fs.unlinkSync(songCachePath + '/' + songID);
                    if(errCallback)
                        errCallback(songID);
                }
            });
        });
        req.on('error', function(e) {
            console.log('error ' + e + ' while fetching! reconnecting in 5s...');
            setTimeout(function() {
                initPm(function() {
                    console.log('error while fetching! now reconnected to gmusic');
                    pm.getStreamUrl(songID, function(streamUrl) {
                        gmusicDownload(streamUrl, songID, callback, errCallback);
                    });
                });
            }, 5000);
        });
        req.end();
    };

    if(startUrl) {
        doDownload(startUrl);
    } else {
        pm.getStreamUrl(songID, function(streamUrl) {
            doDownload(streamUrl);
        });
    }
};

var getAudio = function(songID, callback, errCallback) {
    var filePath = songCachePath + '/' + songID;

    if(fs.existsSync(filePath)) {
        // song was found from cache
        if(callback)
            callback(songID);
        return;
    } else {
        // song had to be downloaded
        gmusicDownload(null, songID, callback, errCallback);
    }
};

// to be called whenever the queue has been modified
// this function will:
// - play back the first song in the queue if no song is playing
// - precache first and second songs in the queue
var queueCheck = function() {
    if(!queue.length) {
        console.log('end of queue, waiting for more songs');
        return;
    }

    var startedPlayingNext = false;
    if(!nowPlaying) {
        // play song
        nowPlaying = queue.shift();
        cleanupSong(nowPlaying.id);
        startedPlayingNext = true;

        for (var i = 0; i < queue.length; i++) {
            queue[i].oldness++;

            // remove bad songs
            var numDownVotes = Object.keys(queue[i].downVotes).length;
            var numUpVotes = Object.keys(queue[i].upVotes).length;
            if(numDownVotes > numUpVotes) {
                console.log('song ' + queue[i].id + ' removed due to downvotes');
                cleanupSong(queue[i].id);
            }
        }
    }

    getAudio(nowPlaying.id, function(songID) {
        if(startedPlayingNext) {
            var filePath = songCachePath + '/' + songID;
            probe(filePath, function(err, probeData) {
                console.log('playing song: ' + nowPlaying.id);
                io.emit('playback', {songID: nowPlaying.id});
                nowPlaying.playbackStart = new Date();

                setTimeout(function() {
                    nowPlaying = null;
                    queueCheck();
                    io.emit('queue', [nowPlaying, queue]);
                }, (probeData.format.duration + 1) * 1000);
            });
        }

        // pre-cache next song in queue
        if(queue.length) {
            getAudio(queue[0].id, function(songID) {
                console.log('successfully pre-cached ' + songID);
            }, function(songID) {
                console.log('error while pre-caching ' + songID);
                cleanupSong(songID);
            });
        } else {
            console.log('nothing to pre-cache');
        }
    }, function(songID) {
        cleanupSong(songID);
        console.log(songID + ' error cb called');
    });
};

var queue = [];
var nowPlaying;

var sortQueue = function() {
    queue.sort(function(a, b) {
        return ((b.oldness + Object.keys(b.upVotes).length - Object.keys(b.downVotes).length) -
               (a.oldness + Object.keys(a.upVotes).length - Object.keys(a.downVotes).length));
    });
};

// find song from queue, if not found then create it
var searchQueue = function(songID) {
    for(var i = 0; i < queue.length; i++) {
        if(queue[i].id === songID)
            return queue[i];
    }

    if(nowPlaying && nowPlaying.id === songID)
        return nowPlaying;

    return null;
};

var cleanupSong = function(songID) {
    for(var i = 0; i < queue.length; i++) {
        if(queue[i].id === songID)
            queue.splice(i, 1);
    }
};

var createSong = function(song) {
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

    // check if the song is already queued
    var queuedSong = searchQueue(song.id);
    if(!queuedSong)
        queuedSong = createSong(song);

    voteSong(queuedSong, +1, userID);
    queueCheck();
    io.emit('queue', [nowPlaying, queue]);

    console.log('added song to queue: ' + queuedSong.id);
    res.send('success');
});

// search for song with given search terms
app.get('/search/:terms', function(req, res) {
    console.log('got search request: ' + req.params.terms);
    pm.search(req.params.terms, 10, function(data) {
        var songs = [];

        if(data.entries) {
            songs = data.entries.sort(function(a, b) {
                return a.score < b.score; // sort by score
            }).filter(function(entry) {
                return entry.type === '1'; // songs only, no albums/artists
            });

            for(var i = 0; i < songs.length; i++) {
                songs[i] = {
                    artist: songs[i].track.artist,
                    title: songs[i].track.title,
                    duration: songs[i].track.durationMillis,
                    id: songs[i].track.nid
                };
            }
        }

        res.send(JSON.stringify(songs));
    }, function(err) {
        console.log(err);
        res.status(404).send(err);
    });
});

app.use('/song', express.static(songCachePath));
app.use(express.static(__dirname + '/public'));

var server = app.listen(process.env.PORT || 8080);
console.log('listening on port ' + (process.env.PORT || 8080));

var io = require('socket.io')(server);
io.on('connection', function(socket) {
    if(nowPlaying) {
        socket.emit('playback', {
            songID: nowPlaying.id,
            position: new Date() - nowPlaying.playbackStart
        });
    }
    socket.emit('queue', [nowPlaying, queue]);
});

var pm = new PlayMusic();
var initPm = function(callback) {
    pm.init(creds, callback);
};
initPm(function() {
    console.log('google play music initialized');
});
