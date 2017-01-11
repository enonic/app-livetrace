exports.startSampling = function () {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return bean.startSampling();
};

exports.stopSampling = function (id) {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return __.toNativeObject(bean.stopSampling(id));
};

exports.getRequestsPerSecond = function () {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return __.toNativeObject(bean.getRequestsPerSecond());
};
