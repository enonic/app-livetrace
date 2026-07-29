var traceLib = require('/lib/livetrace');
var webSocketLib = require('/lib/xp/websocket');

var WS_GROUP_NAME = 'ws-requests';

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

var broadcastRequestRate = function () {
    if (webSocketLib.getGroupSize(WS_GROUP_NAME) === 0) {
        return;
    }

    var reqSec = traceLib.getRequestsPerSecond();
    var msg = JSON.stringify({reqSec: reqSec});
    webSocketLib.sendToGroup(WS_GROUP_NAME, msg);
};

var broadcastRequestsSampled = function () {
    if (webSocketLib.getGroupSize(WS_GROUP_NAME) === 0) {
        return;
    }

    var samplingCount = traceLib.getRequestsCount();

    if (Object.keys(samplingCount).length > 0) {
        var msg = JSON.stringify({"samplingCount": samplingCount});
        webSocketLib.sendToGroup(WS_GROUP_NAME, msg);
    }
};

var handleWebSocket = function (event) {
    var sessionId = event.session.id;
    switch (event.type) {
    case 'open':
        webSocketLib.addToGroup(WS_GROUP_NAME, sessionId);
        break;

    case 'message':
        // handleMessage(event);
        break;

    case 'close':
        webSocketLib.removeFromGroup(WS_GROUP_NAME, sessionId);
        break;
    }
};

exports.get = handleGet;
exports.webSocketEvent = handleWebSocket;
exports.broadcastRequestRate = broadcastRequestRate;
exports.broadcastRequestsSampled = broadcastRequestsSampled;
