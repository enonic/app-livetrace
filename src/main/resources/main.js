var cronLib = require('/lib/cron');
var samplingLib = require('/services/sampling/sampling');

cronLib.schedule({
    name: 'livetrace-request-broadcast',
    fixedDelay: 1000,
    callback: function () {
        samplingLib.broadcastRequestRate();
        samplingLib.broadcastRequestsSampled();
    }
});
