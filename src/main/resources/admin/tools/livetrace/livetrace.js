var mustache = require('/lib/xp/mustache');
var portalLib = require('/lib/xp/portal');
var traceLib = require('/lib/livetrace');

exports.get = function (req) {
    var view = resolve('./livetrace.html');

    var svcUrl = portalLib.serviceUrl({service: 'Z'}).slice(0, -1);
    var params = {
        adminUiAssetsUrl: portalLib.assetUrl({path: "", application: "com.enonic.xp.admin.ui"}),
        launcherJsUrl: portalLib.assetUrl({path: "/js/launcher.js", application: "com.enonic.xp.admin.ui"}),
        assetsUri: portalLib.assetUrl({path: ""}),
        svcUrl: svcUrl,
        disabled: !traceLib.isEnabled(),
        enabled: traceLib.isEnabled()
    };

    return {
        contentType: 'text/html',
        body: mustache.render(view, params)
    };
};