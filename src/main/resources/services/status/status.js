var portal = require('/lib/xp/portal');
var traceLib = require('/lib/livetrace');

var handleGet = function (req) {
    var status = {
        enabled: traceLib.isEnabled()
    };

    return {
        status: 200,
        contentType: 'application/json',
        body: status
    };
};

exports.get = handleGet;
