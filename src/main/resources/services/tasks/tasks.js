var webSocketLib = require('/lib/xp/websocket');
var taskLib = require('/lib/xp/task');
var eventLib = require('/lib/xp/event');

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
        var tasks = taskLib.list();
        webSocketLib.send(sessionId, JSON.stringify({'tasks': tasks}));

        eventLib.listener({
            type: 'task.*',
            localOnly: false,
            callback: function (event) {
                var type = event.type.split('.')[1];
                var msg, task;
                if (type === 'removed') {
                    msg = {event: type, taskId: event.data.id};
                } else {
                    task = taskLib.get(event.data.id);
                    msg = {event: type, task: task};
                }
                webSocketLib.send(sessionId, JSON.stringify(msg));
            }
        });
        break;

    case 'close':
        break;
    }
};