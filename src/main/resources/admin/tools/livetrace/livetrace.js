var mustache = require('/lib/xp/mustache');
var portalLib = require('/lib/xp/portal');
var licenseLib = require('/lib/license');
var adminLib = require('/lib/xp/admin');

exports.get = function (req) {
    var view = resolve('./livetrace.html');

    var licenseDetails = licenseLib.validateLicense({
        appKey: app.name
    });

    var licenseText = licenseDetails && !licenseDetails.expired ? 'Licensed to ' + licenseDetails.issuedTo : '';

    var svcUrl = portalLib.serviceUrl({service: 'Z'}).slice(0, -1);
    var params = {
        adminUiAssetsUrl: portalLib.assetUrl({path: "", application: "com.enonic.xp.admin.ui"}),
        launcherJsUrl: portalLib.assetUrl({path: "/js/launcher.js", application: "com.enonic.xp.admin.ui"}),
        assetsUri: portalLib.assetUrl({path: ""}),
        launcherPath: adminLib.getLauncherPath(),
        launcherUrl: adminLib.getLauncherUrl(),
        adminUrl: adminLib.getBaseUri(),
        svcUrl: svcUrl,
        licenseText: licenseText
    };

    return {
        contentType: 'text/html',
        body: mustache.render(view, params)
    };
};