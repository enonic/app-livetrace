var traceLib = require('/lib/livetrace');
var webSocketLib = require('/lib/xp/websocket');
var taskLib = require('/lib/xp/task');

var WS_GROUP_NAME = 'ws-requests';
var REQUEST_BROADCAST_TASK = 'task-livetrace-request-broadcast';

var broadcastRequestTaskId;

var handleGet = function (req) {
    if (!req.webSocket) {
        return {
            status: 204
        };
    }

    setupRequestRateTask();
    return {
        webSocket: {
            data: {},
            subProtocols: ["livetrace"]
        }
    };
};

var broadcastRequestRate = function () {
    var reqSec = traceLib.getRequestsPerSecond();
    var msg = JSON.stringify({reqSec: reqSec});
    webSocketLib.sendToGroup(WS_GROUP_NAME, msg);
};

var broadcastRequestsSampled = function () {
    var samplingCount = traceLib.getRequestsCount();

    if (Object.keys(samplingCount).length > 0) {
        var msg = JSON.stringify({"samplingCount": samplingCount});
        webSocketLib.sendToGroup(WS_GROUP_NAME, msg);
    }
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
                broadcastRequestsSampled();
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
exports.webSocketEvent = handleWebSocket;
