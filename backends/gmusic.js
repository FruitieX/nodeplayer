var creds = require(process.env.HOME + '/.googlePlayCreds.json');
var PlayMusic = require('playmusic');
var mkdirp = require('mkdirp');
var https = require('https');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');

var config, player;

var gmusicBackend = {};
gmusicBackend.name = 'gmusic';

var gmusicDownload = function(startUrl, songID, callback, errCallback) {
    var doDownload = function(streamUrl) {
        console.log('downloading song ' + songID);

        // download to incomplete/ directory, move it out of there once done
        // this is to safeguard against partyplay crashes and storing an
        // incomplete download in the song cache
        var incompleteFilePath = config.songCachePath + '/gmusic/incomplete/' + songID + '.mp3';
        var filePath = config.songCachePath + '/gmusic/' + songID + '.opus';
        var incompleteSongFd = fs.openSync(incompleteFilePath, 'w');

        var req = https.request(streamUrl, function(res) {
            res.on('data', function(chunk) {
                fs.writeSync(incompleteSongFd, chunk, 0, chunk.length, null);
            });
            res.on('end', function() {
                if(res.statusCode === 302) { // redirect
                    console.log('redirected. retrying with new URL');
                    fs.closeSync(incompleteSongFd);
                    fs.unlinkSync(incompleteFilePath);
                    gmusicDownload(res.headers.location, songID, callback, errCallback);
                } else if(res.statusCode === 200) {
                    console.log('download finished ' + songID + ', transcoding');
                    fs.closeSync(incompleteSongFd);
                    // TODO: can we read this directly from the HTTPS stream?
                    ffmpeg(fs.createReadStream(incompleteFilePath))
                    .noVideo()
                    .audioCodec('libopus')
                    .audioBitrate('192')
                    .on('end', function() {
                        console.log('successfully transcoded ' + songID);
                        if(fs.existsSync(incompleteFilePath))
                            fs.unlinkSync(incompleteFilePath);
                        callback();
                    })
                    .on('error', function(err) {
                        console.log('gmusic: error while transcoding ' + songID + ': ' + err);
                        if(fs.existsSync(filePath))
                            fs.unlinkSync(filePath);
                        if(fs.existsSync(incompleteFilePath))
                            fs.unlinkSync(incompleteFilePath);
                        errCallback();
                    })
                    .save(filePath);
                } else {
                    console.log('ERROR: unknown status code ' + res.statusCode);
                    fs.closeSync(incompleteSongFd);
                    fs.unlinkSync(incompleteFilePath);
                    if(errCallback)
                        errCallback();
                }
            });
        });
        req.on('error', function(e) {
            console.log('error ' + e + ' while fetching! reconnecting in 5s...');
            setTimeout(function() {
                gmusicBackend.init(function() {
                    console.log('error while fetching! now reconnected to gmusic');
                    gmusicBackend.pm.getStreamUrl(songID, function(streamUrl) {
                        gmusicDownload(streamUrl, songID, callback, errCallback);
                    }, function(err) {
                        errCallback(err);
                    });
                });
            }, 5000);
        });
        req.end();
    };

    if(startUrl) {
        doDownload(startUrl);
    } else {
        gmusicBackend.pm.getStreamUrl(songID, function(streamUrl) {
            doDownload(streamUrl);
        }, function(err) {
            errCallback(err);
        });
    }
};

// cache songID to disk.
// on success: callback must be called
// on failure: errCallback must be called with error message
gmusicBackend.prepareSong = function(songID, callback, errCallback) {
    var filePath = config.songCachePath + '/gmusic/' + songID + '.opus';

    if(fs.existsSync(filePath)) {
        // song was found from cache
        if(callback)
            callback();
        return;
    } else {
        gmusicDownload(null, songID, callback, errCallback);
    }
};

// search for music from the backend
// on success: callback must be called with a list of song objects
// on failure: errCallback must be called with error message
gmusicBackend.search = function(query, callback, errCallback) {
    gmusicBackend.pm.search(query.terms, config.searchResultCnt, function(data) {
        var songs;
        var results = {};
        results.songs = {};

        if(data.entries) {
            songs = data.entries.filter(function(entry) {
                return entry.type === '1'; // songs only, no albums/artists
            });

            for(var i = 0; i < songs.length; i++) {
                results.songs[songs[i].track.nid] = {
                    artist: songs[i].track.artist,
                    title: songs[i].track.title,
                    album: songs[i].track.album,
                    albumArt: null, // TODO: can we add this?
                    duration: songs[i].track.durationMillis,
                    songID: songs[i].track.nid,
                    score: songs[i].score,
                    backendName: 'gmusic',
                    format: 'opus'
                };
            }
        }

        callback(results);
    }, function(err) {
        errCallback('error while searching gmusic: ' + err);
    });
};

// called when partyplay is started to initialize the backend
// do any necessary initialization here
gmusicBackend.init = function(_player, callback) {
    player = _player;
    config = _player.config;

    mkdirp(config.songCachePath + '/gmusic/incomplete');

    // initialize google play music backend
    gmusicBackend.pm = new PlayMusic();
    gmusicBackend.pm.init(creds, callback);
};

module.exports = gmusicBackend;
