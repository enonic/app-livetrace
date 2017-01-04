(function ($, svcUrl) {
    "use strict";
    var ws, connected, keepAliveIntervalId;

    $(function () {
        wsConnect();
    });


    // WS - EVENTS

    var wsConnect = function () {
        ws = new WebSocket(getWebSocketUrl(svcUrl + 'traceUrl'), ['trace']);
        ws.onopen = onWsOpen;
        ws.onclose = onWsClose;
        ws.onmessage = onWsMessage;
    };

    var onWsOpen = function () {
        console.log('connect WS');
        keepAliveIntervalId = setInterval(function () {
            if (connected) {
                ws.send('{"action":"KeepAlive"}');
            }
        }, 30 * 1000);
        connected = true;
    };

    var onWsClose = function () {
        clearInterval(keepAliveIntervalId);
        connected = false;

        setTimeout(wsConnect, 2000); // attempt to reconnect
    };

    var onWsMessage = function (event) {
        console.log('WS onWsMessage', event);
    };

    var getWebSocketUrl = function (path) {
        var l = window.location;
        return ((l.protocol === "https:") ? "wss://" : "ws://") + l.host + path;
    };

}($, SVC_URL));
