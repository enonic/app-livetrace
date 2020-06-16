// Libs
var mustache = require('/lib/mustache');
var portalLib = require('/lib/xp/portal');
var licenseLib = require('/lib/license');
var adminLib = require('/lib/xp/admin');


// Functions
var assetUrl = portalLib.assetUrl;
var getLauncherPath = adminLib.getLauncherPath;
var getLauncherUrl = adminLib.getLauncherUrl;
var getBaseUri = adminLib.getBaseUri;
var serviceUrl = portalLib.serviceUrl;
var render = mustache.render;
var validateLicense = licenseLib.validateLicense;


// Constants
var ADMIN_UI_APP = 'com.enonic.xp.admin.ui';
var VIEW = resolve('./livetrace.html');


// Exports
exports.get = function (req) {

    var licenseDetails = validateLicense({
        appKey: app.name
    });

    var params = {
        adminUiAssetsUrl: assetUrl({
          path: '',
          application: ADMIN_UI_APP
        }),
        launcherJsUrl: assetUrl({
          path: '/js/launcher.js',
          application: ADMIN_UI_APP
        }),
        assetsUri: assetUrl({
          path: ''
        }),
        launcherPath: getLauncherPath(),
        launcherUrl: getLauncherUrl(),
        adminUrl: getBaseUri(),
        svcUrl: serviceUrl({service: 'Z'}).slice(0, -1), // Needed by livetrace-tool.js
        licenseText: licenseDetails && !licenseDetails.expired
          ? 'Licensed to ' + licenseDetails.issuedTo
          : ''
    };

    return {
        contentType: 'text/html',
        body: render(VIEW, params)
    };
};
