/* One lazy HTML5 player. No fetch-to-Blob, preloading queue, canvas or background playback. */
window.Aerial = (function () {
    'use strict';

    var video = null, host = null, listeners = [], watchdog = null;
    var generation = 0;

    function stop() {
        generation++;
        clearInterval(watchdog);
        watchdog = null;
        if (video) {
            listeners.forEach(function (l) { video.removeEventListener(l[0], l[1]); });
            listeners = [];
            video.pause();
            video.removeAttribute('src');
            // No <source> children: load() aborts fetching and resets the media pipeline.
            video.load();
            if (video.parentNode) video.parentNode.removeChild(video);
        }
        video = null;
        if (host) host.classList.remove('playing');
        host = null;
        Platform.setNativeSaver(true);
    }

    function start(container, config, onFailure) {
        stop();
        config = config || {};
        var urls = (Array.isArray(config.urls) ? config.urls : []).filter(function (url) {
            // Packaged media or HTTPS. Remote origins must also be allowed in config.xml.
            return typeof url === 'string' && (/^https:\/\/[^\s]+$/i.test(url) ||
                /^media\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp4$/.test(url));
        });
        if (!urls.length || document.hidden) { onFailure(); return; }

        var token = generation, index = 0, lastTime = -1;
        var deadline = 0, started = false;
        var startupMs = Number(config.startupMs) || 8000;
        var stallMs = Number(config.stallMs) || 5000;
        var player = document.createElement('video');
        host = container;
        video = player;
        player.className = 'saver-video';
        player.width = 1920;
        player.height = 1080;
        player.preload = 'none';
        player.controls = false;
        player.muted = true;
        player.defaultMuted = true;
        player.setAttribute('muted', '');
        player.setAttribute('playsinline', '');
        player.setAttribute('aria-hidden', 'true');
        player.tabIndex = -1;
        container.appendChild(player);

        function current() { return generation === token && video === player && !document.hidden; }
        function fail() {
            if (!current()) return;
            stop();
            onFailure();
        }
        function listen(name, fn) {
            var guarded = function () { if (current()) fn(); };
            player.addEventListener(name, guarded);
            listeners.push([name, guarded]);
        }
        function next() {
            if (!current()) return;
            container.classList.remove('playing');
            Platform.setNativeSaver(true);
            started = false;
            lastTime = -1;
            deadline = Date.now() + startupMs;
            player.src = urls[index];
            index = (index + 1) % urls.length;
            player.load();
            try {
                var result = player.play();
                if (result && result.catch) result.catch(fail);
            } catch (e) { fail(); }
        }

        listen('playing', function () {
            started = true;
            deadline = Date.now() + stallMs;
            container.classList.add('playing');
            Platform.setNativeSaver(false);
        });
        listen('timeupdate', function () {
            if (player.currentTime !== lastTime) {
                lastTime = player.currentTime;
                if (started) deadline = Date.now() + stallMs;
            }
        });
        listen('waiting', function () { Platform.setNativeSaver(true); });
        listen('pause', function () { Platform.setNativeSaver(true); });
        listen('error', fail);
        listen('ended', next);
        watchdog = setInterval(function () {
            if (current() && Date.now() >= deadline) fail();
        }, 500);
        next();
    }

    return { start: start, stop: stop };
})();
