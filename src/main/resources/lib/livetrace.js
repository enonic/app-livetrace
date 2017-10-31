exports.startSampling = function (onSample) {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return bean.startSampling(onSample);
};

exports.stopSampling = function (id) {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    bean.stopSampling(id);
};

exports.getRequestsPerSecond = function () {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return __.toNativeObject(bean.getRequestsPerSecond());
};

exports.isEnabled = function () {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return __.toNativeObject(bean.isEnabled());
};

exports.getRequestsCount = function () {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return __.toNativeObject(bean.getSamplingRequestCount());
};
