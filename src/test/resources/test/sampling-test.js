var t = require('/lib/xp/testing');

var state = {
    groupSize: 0,
    sent: [],
    scheduled: []
};

t.mock('/lib/xp/websocket', {
    getGroupSize: function () {
        return state.groupSize;
    },
    sendToGroup: function (group, message) {
        state.sent.push({group: group, message: message});
    },
    addToGroup: function () {
    },
    removeFromGroup: function () {
    }
});

t.mock('/lib/livetrace', {
    getRequestsPerSecond: function () {
        return 42;
    },
    getRequestsCount: function () {
        return {'GET /site': 5};
    }
});

t.mock('/lib/cron', {
    schedule: function (params) {
        state.scheduled.push(params);
    }
});

require('/main.js');

exports.testSchedulesBroadcastJobFromMain = function () {
    t.assertEquals(1, state.scheduled.length, 'a single broadcast job should be scheduled from main.js');

    var job = state.scheduled[0];
    t.assertEquals('livetrace-request-broadcast', job.name, 'job name');
    t.assertEquals(1000, job.fixedDelay, 'job runs with a 1s fixed delay');
    t.assertTrue(typeof job.callback === 'function', 'job callback is a function');
};

exports.testBroadcastsWhenClientsConnected = function () {
    state.groupSize = 2;
    state.sent = [];

    state.scheduled[0].callback();

    t.assertEquals(2, state.sent.length, 'request-rate and sampled counts are both broadcast');

    var rate = JSON.parse(state.sent[0].message);
    t.assertEquals(42, rate.reqSec, 'request-rate value');

    var sampled = JSON.parse(state.sent[1].message);
    t.assertJsonEquals({'GET /site': 5}, sampled.samplingCount, 'sampled request counts');
};

exports.testSkipsBroadcastWhenNobodyWatching = function () {
    state.groupSize = 0;
    state.sent = [];

    state.scheduled[0].callback();

    t.assertEquals(0, state.sent.length, 'nothing is broadcast when the websocket group is empty');
};
