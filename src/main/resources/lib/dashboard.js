var bean = __.newBean('com.enonic.app.livetrace.metrics.MetricsHandler');

exports.subscribe = function (sessionId, onMetricsData) {
    bean.subscribe(sessionId, onMetricsData);
};

exports.unsubscribe = function (sessionId) {
    bean.unsubscribe(sessionId);
};
