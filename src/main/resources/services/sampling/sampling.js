var portal = require('/lib/xp/portal');
var traceLib = require('/lib/livetrace');


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
    return {
        contentType: 'application/json',
        body: {}
    };
};

exports.get = handleGet;

exports.post = handlePost;
