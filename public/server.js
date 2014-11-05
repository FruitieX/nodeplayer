var socket = io();
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

    console.log(data);
});
