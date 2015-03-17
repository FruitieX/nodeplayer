'use strict';
var should = require('chai').should();
var _ = require('underscore');
var Player = require('../player');
var exampleQueue = require('./exampleQueue.json');

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
            player.queue = _.clone(exampleQueue);
            player.config.playedQueueSize = playedQueueSize;
        });
        it('should put a skipped song into playedQueue', function() {
            player.skipSongs(1);
            _.last(player.playedQueue).should.deep.equal(_.first(exampleQueue));
        });
        it('should put multiple skipped songs into playedQueue', function() {
            player.skipSongs(2);
            _.last(player.playedQueue, 2).should.deep.equal(_.first(exampleQueue, 2));
        });
        it('should put up to playedQueueSize songs into playedQueue if skipping by a large amount', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.playedQueue.should.deep.equal(_.last(exampleQueue, playedQueueSize));
        });
        it('should put last song from playedQueue into queue when skipping to prev song', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.skipSongs(-1);
            _.first(player.queue).should.deep.equal(_.last(exampleQueue));
        });
        it('should put up to playedQueueSize songs from playedQueue into queue when skipping to prev songs', function() {
            player.skipSongs(exampleQueue.length + 100);
            player.skipSongs((playedQueueSize + 100) * -1);
            player.queue.should.deep.equal(_.last(exampleQueue, playedQueueSize));
        });
    });

    describe('#shuffleQueue()', function() {
        var player;

        beforeEach(function() {
            player = new Player({logger: dummyLogger});
            player.queue = _.clone(exampleQueue);
        });
        it('should not change the now playing song', function() {
            for(var i = 0; i < 10; i++) {
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
        });
        it('should not add song if required fields are not provided', function() {
            player.addToQueue([{ title: 'foo', songID: 'bar', backendName: 'baz' }]);
            player.addToQueue([{ title: 'foo', songID: 'bar', duration: 42 }]);
            player.addToQueue([{ title: 'foo', backendName: 'bar', duration: 42 }]);
            player.addToQueue([{ songID: 'foo', backendName: 'bar', duration: 42 }]);
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
        it('should add song to beginning of queue (not replacing now playing!) if provided position is negative', function() {
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
            player.queue = _.clone(exampleQueue);
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
            player.queue.should.deep.equal(_.without(exampleQueue, exampleQueue[1], exampleQueue[2]));
        });
        it('should remove songs from playedQueue with negative provided pos', function() {
            player.skipSongs(2);
            player.removeFromQueue(-1, 1);
            player.playedQueue.should.deep.equal([exampleQueue[0]]);
        });
        it('should correctly remove songs from both queue and playedQueue with negative provided pos and cnt (range) spanning both queues', function() {
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
            player.queue = _.clone(exampleQueue);
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
            player.queue = _.clone(exampleQueue);
        });
        it('should move next song to now playing if there is no now playing song', function() {
            player.queue[0] = null;
            player.onQueueModify();
            _.first(player.queue).should.deep.equal(exampleQueue[1]);
        });
    });
});
