var licenseLib = require('/lib/license');

exports.post = function (req) {
    var licenseDetails = licenseLib.validateLicense({
        appKey: app.name
    });

    return {
        status: 200,
        contentType: 'application/json',
        body: {
            licenseValid: licenseDetails && !licenseDetails.expired
        }
    };
};
