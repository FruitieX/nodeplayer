var queue = [];
var progress = {progress: 0, interval: null};
var paused = true;

var socket = io();
socket.on('queue', function(data) {
    queue = data;
    updateQueue();
});

socket.on('playback', function(data) {
    console.log(data);
    var msgTime = new Date().getTime();
    if(!data || !data.playbackStart) {
        $("#audio").trigger('pause');
        paused = true;
        $("#playpauseicon").removeClass("glyphicon-pause glyphicon-play");
        $("#playpauseicon").addClass("glyphicon-play");

        clearInterval(progress.interval);
        if(data) {
            var currentProgress = (data.position || 0);
            progress.started = new Date().getTime() - currentProgress;
            progress.duration = data.duration;
        }
    } else {
        $("#audio").attr('src', '/song/' + data.backendName + '/' + data.songID + '.' + data.format);
        var audio = document.getElementById('audio');
        paused = false;
        $("#playpauseicon").removeClass("glyphicon-pause glyphicon-play");
        $("#playpauseicon").addClass("glyphicon-pause");

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
            queue[0].durationString = durationToString(queue[0].duration / 1000);
            $.tmpl( "nowPlayingTemplate", queue[0]).appendTo("#queue");
            updateProgress(0);
            $("#nowplaying").click(function(e) {
                var posX = e.pageX - $(this).offset().left;
                socket.emit('startPlayback', (posX / $(this).width()) * queue[0].duration);
            });
        }

        // rest of queue
        for(var i = 1; i < queue.length; i++) {
            queue[i].durationString = durationToString(queue[i].duration / 1000);
            queue[i].pos = i;
            $.tmpl( "queueTemplate", queue[i]).appendTo("#queue");
            $("#remove" + i).click(function(e) {
                removeFromQueue(i, queue.backendName + queue.songID);
                e.stopPropagation();
            });
        }
    }
};

var durationToString = function(seconds) {
    var durationString = Math.floor(seconds / 60);
    durationString += ":" + pad(Math.floor(seconds % 60), 2);
    return durationString;
}

var removeFromQueue = function(pos, id) {
    socket.emit('removeFromQueue', {
        pos: pos
    });
    $(document.getElementById(id)).css('background-color', "#fee");
}

var skipSongs = function(cnt) {
    socket.emit('skipSongs', cnt);
}

$(document).ready(function() {
    var nowPlayingMarkup = '<li class="list-group-item now-playing" id="nowplaying">'
        + '<div id="progress"></div>'
        + '<div class="remove glyphicon glyphicon-remove" id="remove${pos}" onclick="removeFromQueue(0, \'${backendName}${songID}\');"></div>'
        + '<div class="np-songinfo">'
        + '<div class="big"><b>${title}</b> - ${durationString}</div>'
        + '<div class="small"><b>${artist}</b> (${album})</div>'
        + '</div>'
        + '</li>';

    $.template( "nowPlayingTemplate", nowPlayingMarkup );

    var queueMarkup = '<li class="list-group-item queue-item" id="${backendName}${songID}" onclick="skipSongs(\'${pos}\');">'
    + '<div class="remove glyphicon glyphicon-remove" id="remove${pos}" onclick="removeFromQueue(\'${pos}\', \'${backendName}${songID}\'); return false;"></div>'
    + '<div class="songinfo">'
    + '<div class="big"><b>${title}</b> - ${durationString}</div>'
    + '<div class="small"><b>${artist}</b> (${album})</div>'
    + '</div>'
    + '</li>';

    $.template( "queueTemplate", queueMarkup );

    var preMuteVolume;
    var setVolumeIcon = function() {
        var volume = $("#audio")[0].volume;
        $("#muteicon").removeClass("glyphicon-volume-off glyphicon-volume-down glyphicon-volume-up");
        if (volume >= 0.5) {
            $("#muteicon").addClass("glyphicon-volume-up");
        } else if (volume > 0) {
            $("#muteicon").addClass("glyphicon-volume-down");
        } else {
            $("#muteicon").addClass("glyphicon-volume-off");
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
    $("#previous").click(function(event) {
        socket.emit('skipSongs', -1);
    });
    $("#next").click(function(event) {
        socket.emit('skipSongs', 1);
    });
    $("#playpause").click(function(event) {
        if(paused)
            socket.emit('startPlayback');
        else
            socket.emit('pausePlayback');
    });
});
