var PMDummy = function() {};

PMDummy.prototype.init = function(config, callback) {
    callback();
}

PMDummy.prototype.getStreamUrl = function (id, success, error) {
    success("https://url/to/music.mp3");
};

PMDummy.prototype.search = function (a, b, success, error) {
    success(JSON.parse('{"entries": [   \
        {   \
            "score": 100,   \
            "type": "1",    \
            "track": {  \
                "title": "song1",   \
                "artist": "qwerty", \
                "nid": "abc",   \
                "durationMillis": "10000"   \
            }   \
        }, {    \
            "score": 90,    \
            "type": "1",    \
            "track": {  \
                "title": "song2",   \
                "artist": "qwerty", \
                "nid": "def",   \
                "durationMillis": "240000"  \
            }   \
        }   \
    ]}'));
};

module.exports = exports = PMDummy;
