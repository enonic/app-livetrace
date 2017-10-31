var portal = require('/lib/xp/portal');
var traceLib = require('/lib/livetrace');
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
    var sessionId = event.session.id, samplingId;

    switch (event.type) {
    case 'open':
        samplingId = traceLib.startSampling(function (value) {
            value = __.toNativeObject(value);
            var msg = JSON.stringify(value);
            webSocketLib.send(sessionId, msg);
        });
        log.info('Started sampling ID: ' + samplingId);

        webSocketLib.send(sessionId, JSON.stringify({samplingId: samplingId}));

        break;

    case 'message':
        var msg = JSON.parse(event.message);
        if (msg.action = 'stop') {
            traceLib.stopSampling(msg.samplingId);
            log.info('Stopped sampling ID: ' + msg.samplingId);
        }
        break;

    case 'close':
        break;
    }
};

exports.get = handleGet;
exports.webSocketEvent = handleWebSocket;
