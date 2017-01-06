function nullOrValue(value) {
    if (value === undefined) {
        return null;
    }

    return value;
}

exports.startSampling = function () {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return bean.startSampling();
};

exports.stopSampling = function (id) {
    var bean = __.newBean('com.enonic.app.livetrace.SamplingHandler');
    return __.toNativeObject(bean.stopSampling(id));
};
