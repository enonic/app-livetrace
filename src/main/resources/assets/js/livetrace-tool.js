(function ($, svcUrl) {
    "use strict";
    var ws, connected, keepAliveIntervalId;
    var samplingId, samplingIntervalId;

    $(function () {
        $('#startSampling').on('click', startSampling);
        $('#stopSampling').on('click', stopSampling);
        //wsConnect();
    });


    // WS - EVENTS

    var wsConnect = function () {
        ws = new WebSocket(getWebSocketUrl(svcUrl + 'traceUrl'), ['trace']);
        ws.onopen = onWsOpen;
        ws.onclose = onWsClose;
        ws.onmessage = onWsMessage;
    };

    var onWsOpen = function () {
        console.log('connect WS');
        keepAliveIntervalId = setInterval(function () {
            if (connected) {
                ws.send('{"action":"KeepAlive"}');
            }
        }, 30 * 1000);
        connected = true;
    };

    var onWsClose = function () {
        clearInterval(keepAliveIntervalId);
        connected = false;

        setTimeout(wsConnect, 2000); // attempt to reconnect
    };

    var onWsMessage = function (event) {
        console.log('WS onWsMessage', event);
    };

    var getWebSocketUrl = function (path) {
        var l = window.location;
        return ((l.protocol === "https:") ? "wss://" : "ws://") + l.host + path;
    };

    //
    var startSampling = function () {
        console.log('Start sampling...');
        $('#startSampling').hide();
        $('#stopSampling').show();
        $('.lt-request-label').text('');

        $('.lt-http-requests').hide();
        $('.lt-http-sampling-message').show();
        $('#samplingSeconds').text('...');

        var samplingStart = new Date();
        samplingIntervalId = setInterval(function () {
            var dif = new Date().getTime() - samplingStart.getTime();
            var seconds = Math.floor(Math.abs(dif / 1000));
            $('#samplingSeconds').text('(' + seconds + (seconds > 1 ? ' seconds' : ' second') + ')');
        }, 1000);

        $.ajax({
            url: svcUrl + 'sampling',
            method: "POST",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            data: {
                action: 'start'
            }
        }).done(function (resp) {
            console.log(resp);
            samplingId = resp.id;

        }).fail(function (jqXHR, textStatus) {
            clearInterval(samplingIntervalId);
            $('#stopSampling').hide();
            $('#startSampling').show();
            $('.lt-http-sampling-message').hide();
            $('.lt-http-requests').show();
        });
    };

    var stopSampling = function () {
        console.log('Stop sampling...');
        $('#stopSampling').hide();
        $('#startSampling').show();
        $('.lt-http-sampling-message').hide();
        $('.lt-http-requests').show();
        clearInterval(samplingIntervalId);

        $.ajax({
            url: svcUrl + 'sampling',
            method: "POST",
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            data: {
                action: 'stop',
                id: samplingId
            }
        }).done(function (resp) {
            console.log(resp);
            samplingId = undefined;
            displayTraceTable(resp.traces);
        }).fail(function (jqXHR, textStatus) {

        });
    };

    var displayTraceTable = function (traces) {
        var i, l = traces.length, trace, row, rows = [];

        $('.lt-request-label').text(l + ' Requests');
        for (i = 0; i < l; i++) {
            trace = traces[i];
            row = traceToRow(trace);
            rows.push(row);
        }

        $('.lt-http-req-table tbody tr').remove();
        $('.lt-http-req-table tbody').append(rows);
    };

    var traceToRow = function (trace) {
        var tr = $('<tr>');
        var traceData = trace.data || {};
        var tdStatus = $('<td>').text(200);
        var tdMethod = $('<td>').text(traceData.method || '');
        var tdPath = $('<td>').text(traceData.path || '').attr('title', traceData.path);
        var tdType = $('<td>').text(traceData.type || '');
        var tdSize = $('<td>').text(traceData.size || '-');
        var tdDuration = $('<td>').text(trace.duration + ' ms');
        tr.append([tdStatus, tdMethod, tdPath, tdType, tdSize, tdDuration]);
        return tr;
    };

}($, SVC_URL));
