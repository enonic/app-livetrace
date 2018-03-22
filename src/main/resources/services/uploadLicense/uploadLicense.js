var portalLib = require('/lib/xp/portal');
var ioLib = require('/lib/xp/io');
var licenseLib = require('/lib/license');

exports.post = function (req) {
    var licenseStream = portalLib.getMultipartStream('license');
    var license = ioLib.readText(licenseStream);

    var licenseDetails = licenseLib.validateLicense({
        license: license,
        appKey: app.name
    });
    var isValid = licenseDetails && !licenseDetails.expired;
    if (isValid) {
        licenseLib.installLicense({
            license: license,
            appKey: app.name
        });
    }

    return {
        status: 200,
        contentType: 'application/json',
        body: {
            licenseValid: !!isValid,
            licenseText: isValid ? 'Licensed to ' + licenseDetails.issuedTo : null
        }
    };
};
