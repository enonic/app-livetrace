// Libs
const mustache = require('/lib/mustache');
const portalLib = require('/lib/xp/portal');
const adminLib = require('/lib/xp/admin');
const licenseManager = require("/lib/license-manager");

// Functions
const assetUrl = portalLib.assetUrl;
const getLauncherPath = adminLib.getLauncherPath;
const getLauncherUrl = adminLib.getLauncherUrl;
const getBaseUri = adminLib.getBaseUri;
const serviceUrl = portalLib.serviceUrl;
const render = mustache.render;


// Constants
const VIEW = resolve('./livetrace.html');

// Exports
exports.get = function (req) {

    const params = {
        assetsUri: assetUrl({
            path: ''
        }),
        launcherPath: getLauncherPath(),
        launcherUrl: getLauncherUrl(),
        adminUrl: getBaseUri(),
        svcUrl: serviceUrl({service: 'Z'}).slice(0, -1), // Needed by livetrace-tool.js
        licenseText: licenseManager.getIssuedTo(),
    };

    return {
        contentType: 'text/html',
        body: render(VIEW, params)
    };
};
