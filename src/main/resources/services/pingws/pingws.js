var webSocketLib = require('/lib/xp/websocket');

var handleGet = function (req) {
    if (!req.webSocket) {
        return {
            status: 204
        };
    }
    return {
        webSocket: {
            data: {},
            subProtocols: ["livetrace"]
        }
    };
};

var handleWebSocket = function (event) {
    var sessionId = event.session.id;

    switch (event.type) {
    case 'open':
        break;

    case 'message':
        var msg = JSON.parse(event.message);
        if (msg.action = 'ping') {
            webSocketLib.send(sessionId, JSON.stringify({'action': 'pong'}));
        }
        break;

    case 'close':
        break;
    }
};

exports.get = handleGet;
exports.webSocketEvent = handleWebSocket;
