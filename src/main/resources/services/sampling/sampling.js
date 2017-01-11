var portal = require('/lib/xp/portal');
var traceLib = require('/lib/livetrace');
var webSocketLib = require('/lib/xp/websocket');
var taskLib = require('/lib/xp/task');

var WS_GROUP_NAME = 'ws-requests';
var REQUEST_BROADCAST_TASK = 'task-livetrace-request-broadcast';

var broadcastRequestTaskId;

var handlePost = function (req) {
    var action = req.params.action;

    if (action === 'start') {
        return startSampling(req);

    } else if (action === 'stop') {
        return stopSampling(req);
    }

    return {
        status: 400
    };
};

var startSampling = function (req) {
    var samplingId = traceLib.startSampling();
    log.info('Sampling ID: ' + samplingId);

    return {
        contentType: 'application/json',
        body: {
            id: samplingId
        }
    };
};

var stopSampling = function (req) {
    var samplingId = req.params.id;
    var traces = traceLib.stopSampling(samplingId);

    return {
        contentType: 'application/json',
        body: traces
    };
};

var handleGet = function (req) {
    if (req.webSocket) {
        setupRequestRateTask();
        return {
            webSocket: {
                data: {},
                subProtocols: ["livetrace"]
            }
        };
    }

    return {
        status: 204
    };
};

var broadcastRequestRate = function () {
    var reqSec = traceLib.getRequestsPerSecond();
    webSocketLib.sendToGroup(WS_GROUP_NAME, reqSec);
};

var setupRequestRateTask = function () {
    var tasks = taskLib.list();
    var taskRunning = false, task;
    for (var i = 0; i < tasks.length; i++) {
        task = tasks[i];
        if (task.description == REQUEST_BROADCAST_TASK && task.state === 'RUNNING') {
            taskRunning = true;
            break;
        }
    }
    if (taskRunning) {
        log.info('Broadcasting request-rate task already running');
        return;
    }

    log.info('Launching broadcasting request-rate task');
    var shutdownRequest = false;
    broadcastRequestTaskId = taskLib.submit({
        description: REQUEST_BROADCAST_TASK,
        task: function (id) {
            do {
                broadcastRequestRate();
                taskLib.sleep(1000);
            } while (!shutdownRequest);
            log.info('Broadcasting request-rate task terminated');
        }
    });

    __.disposer(function () {
        log.info('Application ' + app.name + ' shutting down');
        shutdownRequest = true;
        taskLib.sleep(200);
        broadcastRequestTaskId = undefined;
    });
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
exports.post = handlePost;
exports.webSocketEvent = handleWebSocket;
