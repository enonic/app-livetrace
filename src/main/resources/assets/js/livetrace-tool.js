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
            displayTraceTable(resp.traces, resp.maxDuration);
        }).fail(function (jqXHR, textStatus) {

        });
    };

    var displayTraceTable = function (traces, maxDuration) {
        var i, l = traces.length, trace, row, rows = [];
        if (maxDuration <= 1000) {
            maxDuration = 1000;
        } else {
            maxDuration = Math.ceil(maxDuration / 1000) * 1000;
        }
        setDurationScale(maxDuration);

        $('.lt-request-label').text(l + ' Requests');
        for (i = 0; i < l; i++) {
            trace = traces[i];
            row = traceToRow(trace, maxDuration);
            rows.push(row);
        }

        $('.lt-http-req-table tbody tr').remove();
        $('.lt-http-req-table tbody').append(rows);
    };

    var traceToRow = function (trace, maxDuration) {
        var tr = $('<tr>');
        var traceData = trace.data || {};
        var tdStatus = $('<td>').text(200);
        var tdMethod = $('<td>').text(traceData.method || '');
        var tdPath = $('<td>').text(traceData.path || '').attr('title', traceData.path);
        var tdType = $('<td>').text(traceData.type || '');
        var tdSize = $('<td>').text(formatSize(traceData.size));
        var tdDuration = $('<td>').text(trace.duration + ' ms');
        var tdTimeBar = $('<td colspan="4">');

        var barWidth = Math.ceil((trace.duration / maxDuration) * 100);
        var bar = makeBar(barWidth, trace.duration + 'ms', traceSpeed(trace.duration));
        tdTimeBar.append(bar);
        tr.append([tdStatus, tdMethod, tdPath, tdType, tdSize, tdDuration, tdTimeBar]);
        return tr;
    };

    var makeBar = function (widthPercent, text, clz) {
        var bar = $('<div class="progress-bar horizontal">');
        var track = $('<div class="progress-track">');
        var fill = $('<div class="progress-fill">').css('width', widthPercent + '%').addClass(clz);
        var textEl = $('<span>');//.text(text);

        fill.append(textEl);
        track.append(fill);
        bar.append(track);
        return bar;
    };

    var setDurationScale = function (d) {
        $('#timecol1').text('0 ms');
        $('#timecol2').text(((d / 4)) + ' ms');
        $('#timecol3').text(((d / 4) * 2) + ' ms');
        $('#timecol4').text(((d / 4) * 3) + ' ms');
    };

    var traceSpeed = function (duration) {
        if (duration < 100) {
            return 'fast'
        } else if (duration < 500) {
            return '';
        } else if (duration < 2000) {
            return 'slow';
        }
        return 'slower';
    };

    var formatSize = function (bytes) {
        if (bytes == undefined) {
            return '-';
        }
        if (bytes == 0) {
            return '0 B';
        }
        var k = 1000,
            sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
            i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

}($, SVC_URL));
