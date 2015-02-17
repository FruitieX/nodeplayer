var queue = [];
var progress = {progress: 0, interval: null};

var socket = io();
socket.on('queue', function(data) {
    queue = data;
    updateQueue();
});

socket.on('playback', function(data) {
    console.log(data);
    var msgTime = new Date().getTime();
    if(!data) {
        $("#audio").attr('src', '');
    } else {
        $("#audio").attr('src', '/song/' + data.backendName + '/' + data.songID + '.' + data.format);
        var audio = document.getElementById('audio');

        // TODO: even better sync using NTP
        var setPos = function() {
            var pos = 0;
            if(data.position)
                pos = data.position / 1000 + (new Date().getTime() - msgTime) / 1000;

            console.log('loadedmetadata, starting playback from ' + pos);
            audio.currentTime = pos;
        }
        audio.removeEventListener('loadedmetadata', setPos, false);
        audio.addEventListener('loadedmetadata', setPos, false);

        var currentProgress = (data.position || 0);
        progress.started = new Date() - currentProgress;
        progress.duration = data.duration;

        clearInterval(progress.interval);
        if(data.playbackStart) {
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
}

// UI
var updateProgress = function(dt) { // dt = ms passed since last call
    if(!queue[0]) {
        clearInterval(progress.interval);
        return;
    }

    var currentProgress = new Date() - progress.started;
    $("#progress").css("width", 100 * (currentProgress / progress.duration) + "%");
    if (currentProgress > progress.duration) {
        $("#progress").css("width", "100%");
    }
}

var updateQueue = function() {
    $("#queue").empty();

    if(queue) {
        // now playing
        if(queue[0]) {
            queue[0].duration = durationToString(queue[0].duration / 1000);
            $.tmpl( "nowPlayingTemplate", queue[0]).appendTo("#queue");
            updateProgress(0);
        }
    }
};

var durationToString = function(seconds) {
    var durationString = Math.floor(seconds / 60);
    durationString += ":" + pad(Math.floor(seconds % 60), 2);
    return durationString;
}

$(document).ready(function() {
    var nowPlayingMarkup = '<li class="list-group-item now-playing" id="${id}">'
        + '<div id="progress"></div>'
        + '<div class="np-songinfo">'
        + '<div class="big"><b>${title}</b> - ${duration}</div>'
        + '<div class="small"><b>${artist}</b> (${album})</div>'
        + '</div>'
        + '</li>';

    $.template( "nowPlayingTemplate", nowPlayingMarkup );

    var preMuteVolume;
    var setVolumeIcon = function() {
        var volume = $("#audio")[0].volume;
        $("#mute").removeClass("glyphicon-volume-off glyphicon-volume-down glyphicon-volume-up");
        if (volume >= 0.5) {
            $("#mute").addClass("glyphicon-volume-up");
        } else if (volume > 0) {
            $("#mute").addClass("glyphicon-volume-down");
        } else {
            $("#mute").addClass("glyphicon-volume-off");
        }
    }
    $("#volume").change(function(event) {
        $("#audio")[0].volume = $("#volume").val();
        setVolumeIcon();
    });
    $("#mute").click(function(event) {
        if ($("#volume").val() == 0) {
            $("#audio")[0].volume = preMuteVolume;
            $("#volume").val(preMuteVolume);
        } else {
            preMuteVolume = $("#audio")[0].volume;
            $("#audio")[0].volume = 0;
            $("#volume").val(0);
        }
        setVolumeIcon();
    });
});
