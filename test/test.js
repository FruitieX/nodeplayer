'use strict';

/*jshint expr: true*/
var should = require('chai').should();
var _ = require('underscore');
var Player = require('../lib/player');
var dummyBackend = require('nodeplayer-backend-dummy');
var exampleQueue = require('./exampleQueue.json');

process.env.NODE_ENV = 'test';

var dummyClone = function(obj) {
    return JSON.parse(JSON.stringify(obj));
};

var dummyLogger = {
    silly: _.noop,
    debug: _.noop,
    verbose: _.noop,
    info: _.noop,
    warn: _.noop,
    error: _.noop,
};

describe('exampleQueue', function() {
    it('should contain at least 5 items', function() {
        exampleQueue.length.should.be.above(5);
    });
});

// TODO: test error cases also
describe('Player', function() {
    describe('#setVolume()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
        });
        it('should set volume to 1 by default', function() {
            player.volume.should.equal(1).and.be.a('number');
        });
        it('should set volume to 0 for negative values', function() {
            player.setVolume(-1);
            player.volume.should.equal(0).and.be.a('number');
        });
        it('should set volume to 1 for values greater than 1', function() {
            player.setVolume(42);
            player.volume.should.equal(1).and.be.a('number');
        });
        it('should set volume to 0.5', function() {
            player.setVolume(0.5);
            player.volume.should.equal(0.5).and.be.a('number');
        });
    });

    describe('#skipSongs()', function() {
        var player;
        var playedQueueSize = 3; // TODO: better handling of config variables here

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);
            player.config.playedQueueSize = playedQueueSize;
            player.prepareSongs = _.noop;
        });
        it('should put a skipped song into playedQueue', function() {
            player.skipSongs(1);
            _.last(player.playedQueue).should.deep.equal(_.first(exampleQueue));
        });
        it('should put multiple skipped songs into playedQueue', function() {
            player.skipSongs(2);
            _.last(player.playedQueue, 2).should.deep.equal(_.first(exampleQueue, 2));
        });
        it('should put up to playedQueueSize songs into playedQueue ' +
                'if skipping by a large amount', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.playedQueue.should.deep.equal(_.last(exampleQueue, playedQueueSize));
        });
        it('should put last song from playedQueue into queue ' +
                'when skipping to prev song', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.skipSongs(-1);
            _.first(player.queue).should.deep.equal(_.last(exampleQueue));
        });
        it('should put up to playedQueueSize songs from playedQueue into queue ' +
                'when skipping to prev songs', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.skipSongs((playedQueueSize + 100) * -1);
            player.queue.should.deep.equal(_.last(exampleQueue, playedQueueSize));
        });
    });

    describe('#shuffleQueue()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);
            player.prepareSongs = _.noop;
        });
        it('should not change the now playing song', function() {
            for (var i = 0; i < 10; i++) {
                // no matter how many times we shuffle :-)
                player.shuffleQueue();
                _.first(player.queue).should.deep.equal(_.first(exampleQueue));
            }
        });
    });
    describe('#addToQueue()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.prepareSongs = _.noop;
        });
        it('should not add song if required fields are not provided', function() {
            player.addToQueue([{title: 'foo', songID: 'bar', backendName: 'baz'}]);
            player.addToQueue([{title: 'foo', songID: 'bar', duration: 42}]);
            player.addToQueue([{title: 'foo', backendName: 'bar', duration: 42}]);
            player.addToQueue([{songID: 'foo', backendName: 'bar', duration: 42}]);
            player.queue.length.should.equal(0);
        });
        it('should add song correctly', function() {
            player.addToQueue([_.first(exampleQueue)]);
            _.first(player.queue).should.deep.equal(_.first(exampleQueue));
        });
        it('should add multiple songs correctly', function() {
            player.addToQueue(_.first(exampleQueue, 3));
            player.queue.should.deep.equal(_.first(exampleQueue, 3));
        });
        it('should add song to provided position', function() {
            player.addToQueue(_.first(exampleQueue, 3));
            player.addToQueue([exampleQueue[3]], 1);
            player.queue.should.deep.equal([
                exampleQueue[0],
                exampleQueue[3],
                exampleQueue[1],
                exampleQueue[2]
            ]);
        });
        it('should add multiple songs to provided position', function() {
            player.addToQueue(_.first(exampleQueue, 3));
            player.addToQueue(_.last(exampleQueue, 2), 1);
            player.queue.should.deep.equal([
                exampleQueue[0],
                exampleQueue[exampleQueue.length - 2],
                exampleQueue[exampleQueue.length - 1],
                exampleQueue[1],
                exampleQueue[2]
            ]);
        });
        it('should add song to end of queue if provided position is huge', function() {
            player.addToQueue(_.first(exampleQueue, 3));
            player.addToQueue([_.last(exampleQueue)], 100000);
            player.queue.should.deep.equal([
                exampleQueue[0],
                exampleQueue[1],
                exampleQueue[2],
                exampleQueue[exampleQueue.length - 1]
            ]);
        });
        it('should add song to beginning of queue (not replacing now playing!) ' +
                'if provided position is negative', function() {
            player.addToQueue(_.first(exampleQueue, 3));
            player.addToQueue([_.last(exampleQueue)], -100000);
            player.queue.should.deep.equal([
                exampleQueue[0],
                exampleQueue[exampleQueue.length - 1],
                exampleQueue[1],
                exampleQueue[2]
            ]);
        });
    });
    describe('#removeFromQueue()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);
            player.prepareSongs = _.noop;
        });
        it('should remove song from provided pos', function() {
            player.removeFromQueue(1);
            player.queue.should.deep.equal(_.without(exampleQueue, exampleQueue[1]));
        });
        it('should remove now playing if pos is 0', function() {
            player.removeFromQueue(0);
            player.queue.should.deep.equal(_.without(exampleQueue, exampleQueue[0]));
        });
        it('should remove multiple songs from provided pos', function() {
            player.removeFromQueue(1, 2);
            player.queue.should.deep.equal(_.without(
                exampleQueue,
                exampleQueue[1],
                exampleQueue[2]
            ));
        });
        it('should remove songs from playedQueue with negative provided pos', function() {
            player.skipSongs(2);
            player.removeFromQueue(-1, 1);
            player.playedQueue.should.deep.equal([exampleQueue[0]]);
        });
        it('should correctly remove songs from both queue and playedQueue ' +
                'with negative provided pos and cnt (range) spanning both queues', function() {
            player.skipSongs(2);
            player.removeFromQueue(-1, 3);
            player.playedQueue.should.deep.equal([exampleQueue[0]]);
            /* magic number 4 comes from skipping *2* and removing 3 songs
             * from index -1, removing *2* songs from the queue */
            player.queue.should.deep.equal(_.last(exampleQueue, exampleQueue.length - 4));
        });
    });
    describe('#searchQueue()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);
        });
        it('should return correct song from queue', function() {
            player.searchQueue(exampleQueue[2].backendName, exampleQueue[2].songID)
            .should.deep.equal(exampleQueue[2]);
        });
        it('should return null for bogus terms', function() {
            (player.searchQueue('thisBackendShouldNotExist', 'thisSongIdShouldNotExist') === null)
            .should.equal(true);
        });
    });
    describe('#onQueueModify()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);
            player.prepareSongs = _.noop;
        });
        it('should move next song to now playing if there is no now playing song', function() {
            player.queue[0] = null;
            player.onQueueModify();
            _.first(player.queue).should.deep.equal(exampleQueue[1]);
        });
    });
    describe('#searchBackends()', function() {
        var player;
        var dummyResults;

        beforeEach(function(done) {
            player = new Player({logger: dummyLogger});
            dummyBackend.init(player, dummyLogger, _.noop);
            player.backends.dummyBackend = dummyBackend;
            player.songsPreparing.dummyBackend = {};

            dummyBackend.search({terms: 'dummySearch'}, function(results) {
                dummyResults = {dummy: results};
                done();
            });
        });
        it('should return same results as dummy backend', function(done) {
            player.searchBackends({terms: 'dummySearch'}, function(results) {
                results.should.deep.equal(dummyResults);
                done();
            });
        });
        it('should return empty object if backend errors', function(done) {
            player.searchBackends({terms: 'shouldCauseError'}, function(results) {
                results.should.deep.equal({});
                done();
            });
        });
    });
    describe('#prepareSong()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            dummyBackend.init(player, dummyLogger, _.noop);
            player.backends.dummyBackend = dummyBackend;
            player.songsPreparing.dummyBackend = {};

            player.startPlayback = _.noop;
            player.setPrepareTimeout = _.noop;
        });
        it('should return truthy value (error) if called without song', function(done) {
            player.prepareSong(undefined, function(err) {
                err.should.be.ok;
                done();
            });
        });
        it('should call startPlayback and return falsy value ' +
                'on first queue item if prepared', function(done) {
            player.queue = dummyClone(exampleQueue);
            player.queue[0].songID = 'shouldBePrepared';

            var startPlaybackWasCalled = false;
            player.startPlayback = function() {
                startPlaybackWasCalled = true;
            };

            player.prepareSong(player.queue[0], function(err) {
                startPlaybackWasCalled.should.equal(true);
                (!err).should.be.ok;
                done();
            });
        });
        it('should return truthy value if song already preparing', function(done) {
            player.queue = dummyClone(exampleQueue);

            player.queue[0].songID = 'shouldPrepareForever';

            player.prepareSong(player.queue[0], _.noop);
            player.prepareSong(player.queue[0], function(err) {
                err.should.be.ok;
                done();
            });
        });
    });
    describe('#endOfSong()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);

            player.onQueueModify = _.noop;
        });
        it('should push now playing song onto playedQueue', function() {
            player.endOfSong();
            _.last(player.playedQueue).should.deep.equal(_.first(exampleQueue));
        });
        it('should clear playback state of now playing song', function() {
            player.endOfSong();
            (player.playbackPosition === null).should.be.ok;
            (player.playbackStart === null).should.be.ok;
            (player.queue[0] === null).should.be.ok;
            (player.songEndTimeout === null).should.be.ok;
        });
    });
    describe('#startPlayback()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);

            player.onQueueModify = _.noop;
        });
        afterEach(function() {
            if (player.songEndTimeout) {
                clearTimeout(player.songEndTimeout);
            }
        });
        it('should do nothing if the queue is empty', function() {
            player.queue = [];
            player.startPlayback();

            // something startPlayback() would do after the queue check
            (player.playbackStart === undefined).should.be.ok;
        });
        it('should start playback from the start when first called', function() {
            player.startPlayback();

            player.playbackPosition.should.equal(0);
        });
        it('should start playback from given pos', function() {
            player.startPlayback(42);

            player.playbackPosition.should.equal(42);
        });
        it('should set a song end timeout', function() {
            player.startPlayback(0);

            player.songEndTimeout.should.be.ok;
        });
        it('should resume playback if no pos given', function() {
            player.playbackStart = 42;
            player.playbackPosition = 42;
            player.startPlayback();

            player.playbackPosition.should.equal(42);
        });
        it('should restart playback if pos is 0', function() {
            player.playbackStart = 42;
            player.playbackPosition = 42;
            player.startPlayback(0);

            player.playbackPosition.should.equal(0);
        });
        it('should call song end timeout immediately for insane start pos', function(done) {
            player.endOfSong = function() {
                done();
            };
            player.startPlayback(100000000000);
        });
        it('should clear old song timeout', function(done) {
            player.songEndTimeout = setTimeout(function() {
                throw new Error('this should never be executed');
            }, 0);

            player.endOfSong = function() {
                done();
            };

            // call endOfSong immediately
            player.config.songDelayMs = 0;
            player.queue[0].duration = 0;

            player.startPlayback();
        });
    });
    describe('#pausePlayback()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
        });
        it('should clear songEndTimeout', function(done) {
            player.songEndTimeout = setTimeout(function() {
                throw new Error('this should never be executed');
            }, 0);

            player.pausePlayback();

            setTimeout(function() {
                done();
            }, 0);
        });
        it('should move playbackPosition forward', function() {
            player.playbackPosition = 42;
            player.playbackStart = 42;
            player.pausePlayback();
            player.playbackPosition.should.be.greaterThan(42);
        });
        it('should clear playbackStart', function() {
            player.playbackStart = 42;
            player.pausePlayback();
            (player.playbackStart === null).should.be.ok;
        });
    });
    describe('#prepareError()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = dummyClone(exampleQueue);
        });
        it('should call removeFromQueue on song', function(done) {
            player.removeFromQueue = function(i) {
                i.should.equal(2);
                done();
            };
            player.prepareError(exampleQueue[2], 'dummyError');
        });
        it('should call removeFromQueue on all instances song', function(done) {
            var numCalled = 0;
            player.removeFromQueue = function(i) {
                if (player.queue[i].songID === exampleQueue[2].songID) {
                    numCalled++;
                }

                // song exists 4 times in queue
                if (numCalled === 4) {
                    done();
                }
            };

            player.queue.push(_.clone(exampleQueue[2]));
            player.queue.push(_.clone(exampleQueue[2]));
            player.queue.push(_.clone(exampleQueue[2]));

            player.prepareError(exampleQueue[2], 'dummyError');
        });
    });
    describe('#setPrepareTimeout()', function() {
        var player;
        var song;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.config.songPrepareTimeout = 0;
            song = _.clone(exampleQueue[0]);
            song.cancelPrepare = _.noop;
        });
        afterEach(function() {
            if (song.prepareTimeout) {
                clearTimeout(song.prepareTimeout);
            }
        });
        it('should call cancelPrepare', function(done) {
            song.cancelPrepare = function() {
                done();
            };
            player.setPrepareTimeout(song);
        });
        it('should clear old song timeout', function(done) {
            song.prepareTimeout = setTimeout(function() {
                throw new Error('this should never be executed');
            }, 0);

            song.cancelPrepare = function() {
                done();
            };
            player.setPrepareTimeout(song);
        });
    });
});
