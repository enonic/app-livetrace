// Libs
const mustache = require('/lib/mustache');
const portalLib = require('/lib/xp/portal');
const assetLib = require('/lib/enonic/asset');
const licenseManager = require("/lib/license-manager");

// Functions
const assetUrl = assetLib.assetUrl;
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
        svcUrl: serviceUrl({service: 'Z'}).slice(0, -1), // Needed by livetrace-tool.js
        licenseText: licenseManager.getIssuedTo(),
    };

    return {
        contentType: 'text/html',
        body: render(VIEW, params)
    };
};
