var queue = [];
var queueTruncated = false;
var searchResults = {};
var progress = {progress: 0, interval: null};
var paused = true;

var search = function() {
    var searchTerms = $('#search-terms').val();
    $('#search-button').prop('disabled', true);

    $.ajax({
        type: 'POST',
        url: '/search',
        data: JSON.stringify({
            terms: searchTerms
            //pageToken: 0 // don't use unless you really want a specific page
        }),
        contentType: 'application/json'
    })
    .done(function(data) {
        searchResults = JSON.parse(data);
        $('#search-results').empty();
        $('#search-results-text').removeClass('hidden');
        $('#search-remove').removeClass('hidden');
        $('#search-button').prop('disabled', false);

        // TODO: separate backends somehow
        // right now we just sort songs by score
        var songs = [];
        _.each(_.pluck(searchResults, 'songs'), function(backendSongs) {
            _.each(backendSongs, function(song) {
                songs.push(song);
            });
        });
        songs = _.sortBy(songs, 'score').reverse();
        _.each(songs, function(song) {
            $.tmpl('searchTemplate', {
                title: song.title,
                artist: song.artist,
                album: song.album,
                albumArt: song.albumArt,
                duration: durationToString(song.duration / 1000),
                songID: song.songID,
                backendName: song.backendName
            }).appendTo('#search-results');
        });
        /*
            var songsInOrder = _.sortBy(searchResults[backendName].songs, 'score');
            _.each(songsInOrder, function(songID) {
                var song = searchResults[backendName].songs[songID];
            });
        });
        // TODO: pagination using backendResults.next/prevPageToken
        if (searchResults.length > resultsCount) {
            $.tmpl( 'ellipsisTemplate', {
        */
    }).fail(function() {
        $('#search-button').prop('disabled', false);
    });
};

var appendQueue = function(backendName, songID) {
    if (songID !== 0 && !songID) { return; }
    if (!backendName) { return; }
    searchResults[backendName].songs[songID].userID = $.cookie('userID');
    $.ajax({
        type: 'POST',
        url: '/queue',
        data: JSON.stringify({
            songs: [searchResults[backendName].songs[songID]]
        }),
        contentType: 'application/json'
    });

    $('#search-results').empty();
    $('#search-results-text').addClass('hidden');
    $('#search-remove').addClass('hidden');
};

var searchRemove = function() {
    $('#search-results').empty();
    $('#search-results-text').addClass('hidden');
    $('#search-remove').addClass('hidden');
};

var socket = io();
socket.on('queue', function(data) {
    queue = data.items;
    queueTruncated = (data.length > data.items.length);
    updateQueue();
});

socket.on('volume', function(data) {
    if (data.userID === $.cookie('userID')) { return; }
    $('#volume').val(data.volume);
    $('#audio')[0].volume = data.volume;
});
var setVolume = _.throttle(function(volume) {
    socket.emit('setVolume', {
        userID: $.cookie('userID'),
        volume: volume
    });
}, 100);

socket.on('playback', function(data) {
    console.log(data);
    var currentProgress;
    var msgTime = new Date().getTime();
    if (!data || !data.playbackStart) {
        $('#audio').trigger('pause');
        paused = true;
        $('#playpauseicon').removeClass('glyphicon-pause glyphicon-play');
        $('#playpauseicon').addClass('glyphicon-play');

        clearInterval(progress.interval);
        if (data) {
            currentProgress = (data.position || 0);
            progress.started = new Date().getTime() - currentProgress;
            progress.duration = data.duration;
        }
    } else {
        $('#audio').attr('src', '/song/' + data.backendName +
                '/' + data.songID + '.' + data.format);

        var audio = document.getElementById('audio');
        paused = false;
        $('#playpauseicon').removeClass('glyphicon-pause glyphicon-play');
        $('#playpauseicon').addClass('glyphicon-pause');

        // volume update
        $('#volume').val(data.volume);
        $('#audio')[0].volume = data.volume;

        // TODO: even better sync using NTP
        var setPos = function() {
            var pos = 0;
            if (data.position) {
                pos = data.position / 1000 + (new Date().getTime() - msgTime) / 1000;
            }

            console.log('loadedmetadata, starting playback from ' + pos);
            audio.currentTime = pos;
            audio.removeEventListener('loadedmetadata', setPos, false);
        };
        audio.addEventListener('loadedmetadata', setPos, false);

        currentProgress = (data.position || 0);
        progress.started = new Date() - currentProgress;
        progress.duration = data.duration;

        clearInterval(progress.interval);
        if (data.playbackStart) {
            progress.interval = setInterval(function() {
                updateProgress(100);
            }, 100);
        }
    }
});

var pad = function(number, length) {
    var str = '' + number;

    while (str.length < length) {
        str = '0' + str;
    }

    return str;
};

// UI
var updateProgress = function(dt) { // dt = ms passed since last call
    if (!queue[0]) {
        clearInterval(progress.interval);
        return;
    }

    var currentProgress = new Date() - progress.started;
    $('#progress').css('width', 100 * (currentProgress / progress.duration) + '%');
    if (currentProgress > progress.duration) {
        $('#progress').css('width', '100%');
    }
};

var updateQueue = function() {
    $('#queue').empty();

    if (queue) {
        // now playing
        if (queue[0]) {
            queue[0].durationString = durationToString(queue[0].duration / 1000);
            $.tmpl('nowPlayingTemplate', queue[0]).appendTo('#queue');
            updateProgress(0);
            $('#nowplaying').click(function(e) {
                var posX = e.pageX - $(this).offset().left;
                socket.emit('startPlayback', (posX / $(this).outerWidth()) * queue[0].duration);
            });
            $('#nowplaying').mousemove(function(e) {
                var posX = e.pageX - $(this).offset().left;
                $('#progressmouseover').css('width', 100 * (posX / $(this).outerWidth()) + '%');
            });
            $('#nowplaying').hover(function(e) {
                $('#progressmouseover').css('visibility', 'visible');
            }, function(e) {
                $('#progressmouseover').css('visibility', 'hidden');
            });
            $('#remove0').mousemove(function(e) {
                $('#progressmouseover').css('visibility', 'hidden');
                e.stopPropagation();
            });
            $('#remove0').hover(function(e) {
                // TODO: this is a bit stupid?
                $('#progressmouseover').css('visibility', 'visible');
            });
        }

        var onRemoveClick = function(e) {
            removeFromQueue(i, queue.backendName + queue.songID);
            e.stopPropagation();
        };

        // rest of queue
        for (var i = 1; i < queue.length; i++) {
            queue[i].durationString = durationToString(queue[i].duration / 1000);
            queue[i].pos = i;
            $.tmpl('queueTemplate', queue[i]).appendTo('#queue');
            $('#remove' + i).click(onRemoveClick);
        }
        if (queueTruncated) {
            $.tmpl('queueTruncated').appendTo('#queue');
        }
    }
};

var durationToString = function(seconds) {
    var durationString = Math.floor(seconds / 60);
    durationString += ':' + pad(Math.floor(seconds % 60), 2);
    return durationString;
};

var removeFromQueue = function(pos, id) {
    socket.emit('removeFromQueue', {
        pos: pos
    });
    $(document.getElementById(id)).css('background-color', '#fee');
};

var skipSongs = function(cnt) {
    socket.emit('skipSongs', cnt);
};

$(document).ready(function() {
    // generate a user ID if there is not one yet
    if (!$.cookie('userID')) {
        var s4 = function() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        };
        var guid = s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        $.cookie('userID', guid);
    }

    var nowPlayingMarkup =
        '<li class="list-group-item now-playing" id="nowplaying">' +
        '<div id="progressmouseover"></div>' +
        '<div id="progress"></div>' +
        '<div class="np-songinfo">' +
        '<div class="big"><b>${title}</b> - ${durationString}</div>' +
        '<div class="small"><b>${artist}</b> (${album})</div>' +
        '</div>' +
        '</li>';

    $.template('nowPlayingTemplate', nowPlayingMarkup);

    var searchResultMarkup =
        '<li class="list-group-item searchResult" id="${backendName}${songID}"' +
            'onclick="appendQueue(\'${backendName}\', \'${songID}\')">' +

        '<div class="big"><b>${title}</b> - ${duration}</div>' +
        '<div class="small"><b>${artist}</b> (${album})</div>' +
        '</li>';

    $.template('searchTemplate', searchResultMarkup);

    var ellipsisResultMarkup =
        '<li class="list-group-item searchResult" id="${backendName}${songID}">' +
        '<div class="big">${title}</div>' +
        '</li>';

    $.template('ellipsisTemplate', ellipsisResultMarkup);

    $('#search-terms').keyup(function(e) {
        if (e.keyCode === 13) {
            search();
        }
    });

    var queueMarkup =
        '<li class="list-group-item queue-item" id="${backendName}${songID}"' +
            'onclick="skipSongs(\'${pos}\');">' +

        '<div class="remove glyphicon glyphicon-remove" id="remove${pos}"' +
            'onclick="removeFromQueue(\'${pos}\', \'${backendName}${songID}\'); ' +
            'return false;"></div>' +

        '<div class="songinfo">' +
        '<div class="big"><b>${title}</b> - ${durationString}</div>' +
        '<div class="small"><b>${artist}</b> (${album})</div>' +
        '</div>' +
        '</li>';

    $.template('queueTemplate', queueMarkup);

    var queueTruncatedMarkup = '<li class="list-group-item queue-item">' +
    '<div class="songinfo">' +
    '<div class="big"><b>...</b></div>' +
    '</div>' +
    '</li>';

    $.template('queueTruncated', queueTruncatedMarkup);

    var preMuteVolume;
    var setVolumeIcon = function() {
        var volume = $('#audio')[0].volume;
        $('#muteicon').removeClass(
                'glyphicon-volume-off ' +
                'glyphicon-volume-down ' +
                'glyphicon-volume-up');

        if (volume >= 0.5) {
            $('#muteicon').addClass('glyphicon-volume-up');
        } else if (volume > 0) {
            $('#muteicon').addClass('glyphicon-volume-down');
        } else {
            $('#muteicon').addClass('glyphicon-volume-off');
        }
    };
    $('#volume').on('input', function(event) {
        var volume = $('#volume').val();
        $('#audio')[0].volume = volume;
        setVolume(volume);
        setVolumeIcon();
    });
    $('#mute').click(function(event) {
        if ($('#volume').val() === 0) {
            $('#audio')[0].volume = preMuteVolume;
            $('#volume').val(preMuteVolume);
        } else {
            preMuteVolume = $('#audio')[0].volume;
            $('#audio')[0].volume = 0;
            $('#volume').val(0);
        }
        setVolumeIcon();
    });
    $('#previous').click(function(event) {
        socket.emit('skipSongs', -1);
    });
    $('#next').click(function(event) {
        socket.emit('skipSongs', 1);
    });
    $('#playpause').click(function(event) {
        if (paused) {
            socket.emit('startPlayback');
        } else {
            socket.emit('pausePlayback');
        }
    });
    $('#shuffle').click(function(event) {
        socket.emit('shuffleQueue');
    });
});
