var bodyParser = require('body-parser');
var _ = require('underscore');
var url = require('url');

var rest = {};
var config, player;

// called when partyplay is started to initialize the backend
// do any necessary initialization here
rest.init = function(_player, callback, errCallback) {
    player = _player;
    config = _player.config;

    player.expressApp.get('/queue', function(req, res) {
        var response = [];
        if(player.nowPlaying) {
            response.push({
                artist: player.nowPlaying.artist,
                title: player.nowPlaying.title,
                duration: player.nowPlaying.duration,
                id: player.nowPlaying.id,
                downVotes: player.nowPlaying.downVotes,
                upVotes: player.nowPlaying.upVotes,
                oldness: player.nowPlaying.oldness
            });
        }
        for(var i = 0; i < player.queue.length; i++) {
            response.push({
                artist: player.queue[i].artist,
                title: player.queue[i].title,
                duration: player.queue[i].duration,
                id: player.queue[i].id,
                downVotes: player.queue[i].downVotes,
                upVotes: player.queue[i].upVotes,
                oldness: player.queue[i].oldness
            });
        }
        res.send(JSON.stringify(response));
    });

    // queue song
    player.expressApp.post('/queue', bodyParser.json(), function(req, res) {
        var err = player.addToQueue(req.body.song, {
            userID: req.body.userID
        });
        if(err)
            res.status(404).send(err);
        else
            res.send('success');
    });

    // search for song with given search terms
    player.expressApp.get('/search/:terms', function(req, res) {
        console.log('got search request: ' + req.params.terms);

        var resultCnt = 0;
        var results = [];

        _.each(player.backends, function(backend) {
            backend.search(req.params.terms, function(songs) {
                resultCnt++;

                _.each(songs, function(song) {
                    results.push(song);
                });

                // got results from all services?
                if(resultCnt >= Object.keys(player.backends).length)
                    res.send(JSON.stringify(results));
            }, function(err) {
                resultCnt++;
                console.log(err);

                // got results from all services?
                if(resultCnt >= Object.keys(player.backends).length)
                    res.send(JSON.stringify(results));
            });
        });
    });

    callback();
};

rest.onBackendInit = function(playerState, backend) {
    // expressjs middleware for requesting music data
    // must support ranges in the req, and send the data to res
    player.expressApp.use('/song/' + backend.name, function(req, res, next) {
        send(req, url.parse(req.url).pathname, {
            dotfiles: 'allow',
            root: config.songCachePath + '/' + backend.name
        }).pipe(res);
    });
};

module.exports = rest;
