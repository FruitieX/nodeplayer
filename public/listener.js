var queue = [];
var progress = {progress: 0, interval: null};

var socket = io();
socket.on('queue', function(data) {
    queue = data;
    updateQueue();
});

socket.on('playback', function(data) {
    $("#audio").attr('src', '/song/' + data.backend + '/' + data.songID + '.mp3');
    var audio = document.getElementById('audio');

    var setPos = function() {
        if(data.position) {
            audio.currentTime = data.position / 1000;
        } else {
            audio.currentTime = 0;
        }
        audio.removeEventListener('canplaythrough', setPos, false);
    }
    audio.addEventListener('canplaythrough', setPos, false);

    progress.progress = (data.position || 0);
    progress.duration = data.duration;

    clearInterval(progress.interval);
    progress.interval = setInterval(function() {
        updateProgress(100);
    }, 100);
});

// UI
var updateProgress = function(dt) { // dt = ms passed since last call
    progress.progress += dt;
    $("#progress").css("width", 100 * (progress.progress / progress.duration) + "%");
    if (progress.progress > progress.duration) {
        $("#progress").css("width", "100%");
    }
}

var updateQueue = function() {
    $("#queue").empty();

    // now playing
    if(queue[0]) {
        $.tmpl( "nowPlayingTemplate", queue[0]).appendTo("#queue");
        updateProgress(0);
    }
}

$(document).ready(function() {
    var nowPlayingMarkup = '<li class="list-group-item now-playing" id="${id}">'
        + '<div id="progress"></div>'
        + '<div class="nowplayingicon">'
        + '<span class="glyphicon glyphicon-play"></span>'
        + '</div>'
        + '<div class="title">${title}</div>'
        + '<div class="artist">${artist}</div>'
        + '</li>';

    $.template( "nowPlayingTemplate", nowPlayingMarkup );
    $("#domain").html('queue songs at: <a>http://' + location.host + '</a>');
});
