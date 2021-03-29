var portalLib = require('/lib/xp/portal');
var ioLib = require('/lib/xp/io');
const licenseManager = require("/lib/license-manager");

exports.post = function (req) {
    var licenseStream = portalLib.getMultipartStream('license');
    var license = ioLib.readText(licenseStream);
    const licenseInstalled = licenseManager.installLicense(license);

    return {
        status: 200,
        contentType: 'application/json',
        body: {
            licenseValid: licenseInstalled,
            licenseText: licenseManager.getIssuedTo()
        }
    };
};
