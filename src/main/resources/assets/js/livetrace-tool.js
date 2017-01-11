(function ($, svcUrl) {
    "use strict";
    var ws, connected, keepAliveIntervalId;
    var samplingId, samplingIntervalId;
    var requestRate = {
        data: null,
        x: null,
        y: null,
        h: 0,
        w: 0,
        yScale: 10,
        chart: null,
        rescaleCheck: 0
    };
    var BAR_COUNT = 20;

    $(function () {
        $('#startSampling').on('click', startSampling);
        $('#stopSampling').on('click', stopSampling);
        initRequestRateData();
        wsConnect();

        setInterval(redrawRequestRate, 1000);
        window.addEventListener('resize', function (e) {
            initRequestRateData();
        });

    });


    // WS - EVENTS

    var wsConnect = function () {
        ws = new WebSocket(getWebSocketUrl(svcUrl + 'sampling'), ['livetrace']);
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

        setTimeout(wsConnect, 5000); // attempt to reconnect
    };

    var onWsMessage = function (event) {
        var reqSec = Number(event.data);
        handleNewRequestRate(reqSec);
    };

    var getWebSocketUrl = function (path) {
        var l = window.location;
        return ((l.protocol === "https:") ? "wss://" : "ws://") + l.host + path;
    };

    // HTTP
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
        if (maxDuration <= 500) {
            maxDuration = 500;
        } else {
            maxDuration = Math.ceil(maxDuration / 1000) * 1000;
        }
        setDurationScale(maxDuration);

        $('.lt-request-label').text(l + ' Requests');
        for (i = 0; i < l; i++) {
            trace = traces[i];
            row = traceToRow(trace, maxDuration).addClass(i % 2 == 0 ? 'lt-even' : 'lt-odd');
            rows.push(row);
        }

        $('.lt-http-req-table tbody tr').remove();
        $('.lt-http-req-table tbody').append(rows);
    };

    var traceToRow = function (trace, maxDuration) {
        var tr = $('<tr>').on('click', rowClick).data('t', trace.children).data('md', maxDuration).data('s', new Date(trace.start));
        var traceData = trace.data || {};
        var tdStatus = $('<td>').text(traceData.status);
        var tdMethod = $('<td>').text(traceData.method || '');
        var tdPath = $('<td>').text(traceData.path || '').attr('title', traceData.path);
        var tdType = $('<td>').text(traceData.type || '');
        var tdSize = $('<td>').text(formatSize(traceData.size));
        var tdDuration = $('<td>').text(trace.duration + ' ms');
        var tdTimeBar = $('<td colspan="4">');

        var barWidth = Math.ceil((trace.duration / maxDuration) * 100);
        var bar = makeBar(barWidth, 0, traceSpeed(trace.duration));
        tdTimeBar.append(bar);
        tr.append([tdStatus, tdMethod, tdPath, tdType, tdSize, tdDuration, tdTimeBar]);
        return tr;
    };

    var makeBar = function (widthPercent, offset, clz) {
        var bar = $('<div class="progress-bar horizontal">');
        var track = $('<div class="progress-track">');
        var fill = $('<div class="progress-fill">').css('width', widthPercent + '%').addClass(clz);
        if (offset) {
            fill.css('left', offset + '%');
        }

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
        if (duration < 250) {
            return 'fast'
        } else if (duration < 1000) {
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
    };

    var rowClick = function (e) {
        var currentSelected = $(this).next('tr').hasClass('lt-http-req-remove');
        $('.lt-http-req-remove').remove();
        if (currentSelected) {
            return;
        }

        var subTraces = $(this).data('t');
        if (!subTraces || subTraces.length === 0) {
            return;
        }
        var maxDuration = $(this).data('md');
        var oddEven = $(this).hasClass('lt-even') ? 'lt-even' : 'lt-odd';
        var parentStart = $(this).data('s');

        var head = $(
            '<tr class="lt-http-req-remove lt-sub-header"><td>Trace</td><td></td><td>Script / Class</td><td>Application</td><td></td><td></td><td class="lt-http-req-sub-time" colspan="4">Execution time</tr>')
            .addClass(oddEven);

        var i, l, traces = [], bodyTr, bodyTrs = [head];
        flattenTraces(subTraces, traces);
        for (i = 0, l = traces.length; i < l; i++) {
            bodyTr = subtraceToRow(traces[i], maxDuration, parentStart);
            bodyTr.addClass(oddEven);
            bodyTrs.push(bodyTr);
        }
        $(this).after(bodyTrs);
    };

    var flattenTraces = function (traces, res, level) {
        res = res || [];
        level = level || 0;
        for (var i = 0, l = traces.length, tr; i < l; i++) {
            tr = traces[i];
            tr.l = level;
            res.push(tr);
            if (tr.children) {
                flattenTraces(tr.children, res, level + 1);
            }
        }
    };

    var subtraceToRow = function (trace, maxDuration, parentStart) {
        var traceData = trace.data || {};
        var script = traceData.script, app = '';
        if (script) {
            var p = traceData.script.indexOf(':');
            if (p > -1) {
                app = script.substring(0, p);
                script = script.substring(p + 1);
            }
        }

        var tr = $('<tr class="lt-http-req-remove">');
        var traceText = '';
        if (trace.name === 'renderComponent') {
            traceText = capitalize(traceData.type);
            script = traceData.path;
        } else if (trace.name === 'controllerScript') {
            traceText = 'Script';
        }
        var tdTrace = $('<td>').text(traceText);
        var tdMethod = $('<td>');
        var tdScriptClass = $('<td>').text(script).attr('title', script).css('padding-left', trace.l * 8 + 'px');
        var tdApp = $('<td>').text(app || '');
        var tdSize = $('<td>');
        var tdDuration = $('<td>').text(trace.duration + ' ms');
        var tdTimeBar = $('<td colspan="4">');

        var offset = new Date(trace.start).getTime() - parentStart.getTime();
        var offsetWidth = Math.ceil((offset / maxDuration) * 100);
        var barWidth = Math.ceil((trace.duration / maxDuration) * 100);
        var bar = makeBar(barWidth, offsetWidth, '');
        tdTimeBar.append(bar);
        tr.append([tdTrace, tdMethod, tdScriptClass, tdApp, tdSize, tdDuration, tdTimeBar]);
        return tr;
    };

    var capitalize = function (v) {
        return v && v.length ? v.charAt(0).toUpperCase() + v.slice(1) : '';
    };

    // Request Rate
    var initRequestRateData = function () {
        var elW = $('.lt-request-chart-cnt').width();
        var w = Math.floor(elW / BAR_COUNT), h = 60;

        var t = new Date().getTime();
        if (!requestRate.data) {
            requestRate.data = [];
            for (var i = 0; i < BAR_COUNT; i++) {
                requestRate.data.push({
                    time: t,
                    value: 0,
                    source: 0
                });
            }
        }

        var x = d3.scaleLinear()
            .domain([0, 1])
            .range([0, w]);

        var y = d3.scaleLinear()
            .domain([0, 100])
            .rangeRound([0, h]);


        var chart = d3.select(".lt-request-chart")
            .attr("width", w * requestRate.data.length - 1)
            .attr("height", h);

        chart.append("svg:line")
            .attr("x1", 0)
            .attr("x2", w * requestRate.data.length)
            .attr("y1", h - .5)
            .attr("y2", h - .5)
            .attr("stroke", "#000");

        chart.selectAll('rect').attr('width', w);

        requestRate.x = x;
        requestRate.y = y;
        requestRate.h = h;
        requestRate.w = w;
        requestRate.chart = chart;
    };

    var handleNewRequestRate = function (reqPerSec) {
        $('.lt-request-rate span').text(Math.ceil(reqPerSec));
        console.log('REQ: ' + reqPerSec);
        var reqPoint = {
            time: new Date().getTime(),
            value: scaleValue(reqPerSec),
            source: reqPerSec
        };
        requestRate.data.shift();
        requestRate.data.push(reqPoint);

        if (reqPerSec > requestRate.yScale) {
            requestRate.yScale = Math.ceil(reqPerSec * 1.2);
            console.log('New Req max: ' + requestRate.yScale);
            rescaleBars();
        } else {
            checkDownScale();
        }
    };

    var scaleValue = function (v) {
        return (v / requestRate.yScale) * requestRate.h;
    };

    var checkDownScale = function () {
        var t = requestRate.rescaleCheck || 0;
        var n = new Date().getTime();
        if (n - t > 10000) {
            var max = 0;
            for (var i = 0, l = requestRate.data.length; i < l; i++) {
                if (requestRate.data[i].source > max) {
                    max = requestRate.data[i].source;
                }
            }
            max = Math.max(Math.ceil(max * 1.2), 10);
            if (max < requestRate.yScale) {
                requestRate.yScale = max;
                console.log('New Req max: ' + requestRate.yScale);
                rescaleBars();
            }

            requestRate.rescaleCheck = new Date().getTime();
        }
    };

    var rescaleBars = function () {
        // re-scale data height in chart
        for (var i = 0, l = requestRate.data.length; i < l; i++) {
            var d = requestRate.data[i];
            d.value = scaleValue(d.source);
        }

        // refresh scaled bars in chart
        var h = requestRate.h, y = requestRate.y;
        requestRate.chart.selectAll("rect")
            .attr("y", function (d) {
                return h - y(d.value) - .5;
            })
            .attr("height", function (d) {
                return y(d.value);
            });
    };

    var redrawRequestRate = function () {
        var data = requestRate.data;
        var x = requestRate.x;
        var y = requestRate.y;
        var h = requestRate.h;
        var w = requestRate.w;

        var rect = requestRate.chart.selectAll("rect")
            .data(data, function (d) {
                return d.time;
            });

        rect.enter().insert("svg:rect", "line")
            .attr("x", function (d, i) {
                return x(i + 1) - .5;
            })
            .attr("y", function (d) {
                return h - y(d.value) - .5;
            })
            .attr("width", w)
            .attr("height", function (d) {
                return y(d.value);
            })
            .transition()
            .duration(800)
            .attr("x", function (d, i) {
                return x(i) - .5;
            });

        rect.transition()
            .duration(800)
            .attr("x", function (d, i) {
                return x(i) - .5;
            });

        rect.exit().transition()
            .duration(800)
            .attr("x", function (d, i) {
                return x(i - 1) - .5;
            })
            .remove();
    };

}($, SVC_URL));
