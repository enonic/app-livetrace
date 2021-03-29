const licenseManager = require("/lib/license-manager");

exports.post = function (req) {

    return {
        status: 200,
        contentType: 'application/json',
        body: {
            licenseValid: licenseManager.isCurrentLicenseValid()
        }
    };
};
