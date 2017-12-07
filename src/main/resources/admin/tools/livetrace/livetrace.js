var mustache = require('/lib/xp/mustache');
var portalLib = require('/lib/xp/portal');
var adminLib = require('/lib/xp/admin');

exports.get = function (req) {
    var view = resolve('./livetrace.html');

    var svcUrl = portalLib.serviceUrl({service: 'Z'}).slice(0, -1);
    var params = {
        adminUiAssetsUrl: portalLib.assetUrl({path: "", application: "com.enonic.xp.admin.ui"}),
        launcherJsUrl: portalLib.assetUrl({path: "/js/launcher.js", application: "com.enonic.xp.admin.ui"}),
        assetsUri: portalLib.assetUrl({path: ""}),
        adminUrl : adminLib.getBaseUri(),
        launcherUrl: portalLib.assetUrl({path: '/js/launcher', application: 'com.enonic.xp.app.main'}),
        svcUrl: svcUrl
    };

    return {
        contentType: 'text/html',
        body: mustache.render(view, params)
    };
};