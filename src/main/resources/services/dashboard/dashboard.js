var webSocketLib = require('/lib/xp/websocket');
var dashboardLib = require('/lib/dashboard');

exports.get = function (req) {
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

exports.webSocketEvent = function (event) {
    var sessionId = event.session.id;

    switch (event.type) {
    case 'open':
        dashboardLib.subscribe(sessionId, function (value) {
            value = __.toNativeObject(value);
            webSocketLib.send(sessionId, JSON.stringify(value));
        });
        break;

    case 'close':
        dashboardLib.unsubscribe(sessionId);

        break;
    }
};