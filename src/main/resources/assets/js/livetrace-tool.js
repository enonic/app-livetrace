class WebSocketConnection {
    constructor(url) {
        this.url = this._getWebSocketUrl(url);
        this.webSocket = null;
        this.connected = false;
        this.keepAliveIntervalId = null;
        this.reconnectTimeoutId = null;
        this.onMessageCallback = null;
        this.onConnectCallback = null;
        this.onErrorCallback = null;
    }

    connect() {
        this.connected = false;
        clearTimeout(this.reconnectTimeoutId);
        const ws = new WebSocket(this.url, ['livetrace']);
        this.webSocket = ws;
        ws.onopen = this._onWsOpen.bind(this);
        ws.onclose = this._onWsClose.bind(this);
        ws.onmessage = this._onWsMessage.bind(this);
        ws.onerror = this._onWsError.bind(this);
    }

    disconnect() {
        this.connected = false;
        clearInterval(this.keepAliveIntervalId);
        this.webSocket && this.webSocket.close(1000);
    }

    send(msg) {
        if (this.connected) {
            this.webSocket.send(JSON.stringify(msg));
        }
    }

    onConnect(callback) {
        this.onConnectCallback = callback;
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    onError(callback) {
        this.onErrorCallback = callback;
    }

    _onWsOpen() {
        console.log('connect WS (' + this.url + ')');
        this.keepAliveIntervalId = setInterval(function () {
            if (this.connected) {
                this.webSocket.send('{"action":"KeepAlive"}');
            }
        }, 30 * 1000);
        this.connected = true;

        if (this.onConnectCallback) {
            this.onConnectCallback();
        }
    }

    _onWsClose() {
        clearInterval(this.keepAliveIntervalId);
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this.reconnectTimeoutId = setTimeout(() => this.connect(), 5000); // attempt to reconnect
    }

    _onWsMessage(event) {
        const msg = JSON.parse(event.data);
        if (this.onMessageCallback) {
            this.onMessageCallback(msg);
        }
    }

    _onWsError(e) {
        if (this.onErrorCallback) {
            this.onErrorCallback(e);
        }
    }

    _getWebSocketUrl(path) {
        const l = window.location;
        return ((l.protocol === "https:") ? "wss://" : "ws://") + l.host + path;
    }
}

(function ($, svcUrl) {
    "use strict";
    var requestConn = null, samplingConn = null, wsAvailable = false;
    var samplingId, samplingIntervalId, samplingCount = 0;
    var sampling = {
        traces: [],
        maxDuration: 500,
        httpFilterMaxDuration: null,
        httpFilterType: '',
        httpFilterUrl: ''
    };
    var requestRate = {
        data: null,
        yScale: 10,
        rescaleCheck: 0,
        chartHeight: null,
        chartBarWidth: null
    };
    var REQ_RATE_BAR_COUNT = 20;
    var redrawTimer;
    var timeDurationMode = 'duration';
    var $ltRequestChart = $('.lt-request-chart');
    var selectedTraceIds = {};

    $(function () {
        $('.lt-http-requests').show();
        $('#startSampling').on('click', startSampling);
        $('#stopSampling').on('click', stopSampling);

        $('#httpTraceAll').on('click', {t: 'all'}, httpApplyFilter);
        $('#httpTracePage').on('click', {t: 'page'}, httpApplyFilter);
        $('#httpTraceComponent').on('click', {t: 'component'}, httpApplyFilter);
        $('#httpTraceService').on('click', {t: 'service'}, httpApplyFilter);
        $('#httpTraceAsset').on('click', {t: 'asset'}, httpApplyFilter);
        $('#httpTraceImage').on('click', {t: 'image'}, httpApplyFilter);
        $('#httpTraceOther').on('click', {t: 'other'}, httpApplyFilter);
        $('#httpTraceWs').on('click', {t: 'ws'}, httpApplyFilter);
        $('#timeToggle').on('click', toggleTime);

        var typingTimer, doneTypingInterval = 800;
        var searchInput = $('#filterUrl');
        searchInput.on('keyup', function (e) {
            clearTimeout(typingTimer);
            if (e.which === 13) {
                httpApplyUrlFilter();
                return;
            }
            typingTimer = setTimeout(httpApplyUrlFilter, doneTypingInterval);
        });
        searchInput.on('keydown', function () {
            clearTimeout(typingTimer);
        });

        initRequestRateData();
        requestConn = new WebSocketConnection(svcUrl + 'sampling');
        requestConn.onMessage(onRequestMessage);
        requestConn.onError(() => {
            checkAuthenticated();
            if (!wsAvailable) {
                $('.lt-http-trace-websocket-message').show().addClass('shake');
                $('.lt-http-requests').hide();
                $('#startSampling').hide();
                $('#stopSampling').hide();
            } else {
                $('#startSampling').show();
                $('#stopSampling').hide();
            }
        });
        requestConn.onConnect(() => {
            wsAvailable = true;
            $('.lt-http-trace-websocket-message').hide();
            $('.lt-http-requests').show();
            $('#startSampling').show();
            $('#stopSampling').hide();
        });
        requestConn.connect();

        redrawRequestRateTask();
        window.addEventListener('resize', function (e) {
            initRequestRateData();
            displayTraceTable();
        });
    });

    var redrawRequestRateTask = function () {
        clearTimeout(redrawTimer);
        redrawTimer = setTimeout(function () {
            redrawRequestRate();
            redrawRequestRateTask();
        }, 1000);
    };

    var onRequestMessage = function (msg) {
        if (msg.reqSec != null) {
            var reqSec = Number(msg.reqSec);
            handleNewRequestRate(reqSec);
        } else if (msg.samplingCount) {
            var count = msg.samplingCount[samplingId];
            samplingCount = count === undefined ? samplingCount : count;
        }
    };

    // HTTP
    var checkAuthenticated = function () {
        $.ajax({
            url: svcUrl + 'status',
            method: "GET"
        }).fail(function (jqXHR) {
            if (jqXHR.status === 401) {
                location.reload();
            }
        });
    };

    var startSampling = function () {
        console.log('Start sampling...');
        sampling.traces = [];
        sampling.maxDuration = 500;
        selectedTraceIds = {};

        $('#startSampling').hide();
        $('#stopSampling').show();
        $('.lt-request-label').text('');

        $('.lt-http-requests').hide();
        $('.lt-http-sampling-message').show();
        $('#samplingSeconds').text('...');
        $('.lt-http-req-table tbody tr').remove();

        var samplingStart = new Date();
        samplingIntervalId = setInterval(function () {
            var dif = new Date().getTime() - samplingStart.getTime();
            var seconds = Math.floor(Math.abs(dif / 1000));
            var samplingText = '(' + quantityWord(seconds, '...', '1 second', seconds + ' seconds') +
                               ' — ' +
                               quantityWord(samplingCount, 'No requests yet', '1 request captured', samplingCount + ' requests captured') +
                               ')';
            $('#samplingSeconds').text(samplingText);
        }, 1000);

        samplingCount = 0;

        samplingConn = new WebSocketConnection(svcUrl + 'tracing');
        samplingConn.onMessage(samplingTracesReceived);
        samplingConn.onError(() => {
            checkAuthenticated();
            clearInterval(samplingIntervalId);
            $('#stopSampling').hide();
            $('#startSampling').show();
            $('.lt-http-sampling-message').hide();
            $('.lt-http-requests').show();
        });
        samplingId = undefined;
        samplingConn.connect();
    };

    var samplingTracesReceived = function (msg) {
        if (msg.samplingId) {
            samplingId = msg.samplingId;
            return
        } else if (msg.action === 'stop') {
            stopSampling();
            return;
        }

        var forceRefresh = extractSubtraces(msg.traces);

        sampling.traces = sampling.traces.concat(msg.traces);
        sampling.maxDuration = Math.max(sampling.maxDuration, msg.maxDuration);
        sampling.httpFilterMaxDuration = null;

        $('.lt-http-sampling-message').hide();
        $('.lt-http-requests').show();
        clearInterval(samplingIntervalId);
        samplingIntervalId = null;

        displayTraceTable(forceRefresh);
    };

    var stopSampling = function () {
        console.log('Stop sampling...');
        $('#stopSampling').hide();
        $('#startSampling').show();
        $('.lt-http-sampling-message').hide();
        $('.lt-http-requests').show();
        clearInterval(samplingIntervalId);

        samplingConn.send({action: 'stop', samplingId: samplingId});
        samplingConn.disconnect();
    };

    var httpApplyUrlFilter = function (e) {
        sampling.httpFilterUrl = $('#filterUrl').val().trim();
        displayTraceTable(true);
    };

    var httpApplyFilter = function (e) {
        $('.lt-http-toolbar .lt-active').removeClass('lt-active');
        $(this).addClass('lt-active').blur();

        sampling.httpFilterType = e.data.t;
        sampling.httpFilterUrl = $('#filterUrl').val().trim();
        displayTraceTable(true);
    };

    var toggleTime = function (e) {
        timeDurationMode = timeDurationMode === 'duration' ? 'time' : 'duration';
        displayTraceTable(true);
    };

    var httpFilters = {
        'all': null,
        'page': function (t) {
            var p = t.data.rawpath || t.data.path;
            return t.data.type && t.data.type.indexOf('text/html') > -1 && !(p && p.indexOf('/_/') > -1);
        },
        'component': function (t) {
            var p = t.data.rawpath || t.data.path;
            return p && p.indexOf('/_/component/') > -1;
        },
        'service': function (t) {
            var p = t.data.rawpath || t.data.path;
            return p && p.indexOf('/_/service/') > -1;
        },
        'asset': function (t) {
            var p = t.data.rawpath || t.data.path;
            return p && p.indexOf('/_/asset/') > -1;
        },
        'image': function (t) {
            var p = t.data.rawpath || t.data.path;
            return p && p.indexOf('/_/image/') > -1;
        },
        'ws': function (t) {
            return isWebSocket(t);
        },
        'other': function (t) {
            return !httpFilters.page(t) && !httpFilters.component(t) && !httpFilters.service(t) && !httpFilters.asset(t) &&
                   !httpFilters.image(t) && !httpFilters.ws(t);
        }
    };

    var filterTraces = function (traces) {
        sampling.httpFilterMaxDuration = null;
        var f = httpFilters[sampling.httpFilterType];
        var filterSet = !!f, searchSet = sampling.httpFilterUrl !== '';
        if (!filterSet && !searchSet) {
            return traces;
        }

        var maxDuration = 0;

        traces = traces.filter(function (t) {
            var r = (!filterSet || f(t)) && (!searchSet || (t.data.path.indexOf(sampling.httpFilterUrl) > -1));
            if (r && (t.duration > maxDuration)) {
                maxDuration = t.duration;
            }
            return r;
        });

        sampling.httpFilterMaxDuration = maxDuration;

        return traces;
    };

    var extractSubtraces = function (traces) {
        var forceRefresh = false, t, pt, trace, parentTrace;
        for (t = traces.length - 1; t >= 0; t--) {
            trace = traces[t];
            if (trace.data.parentId) {
                traces.splice(t, 1);
                forceRefresh = true;
                for (pt = 0; pt < sampling.traces.length; pt++) {
                    parentTrace = sampling.traces[pt];
                    if (parentTrace.id === trace.data.parentId) {
                        parentTrace.children = (parentTrace.children || []);
                        parentTrace.children.push(trace);
                        break;
                    }
                }
                if (trace.children) {
                    extractSubtraces(trace.children);
                }
            }
        }
        return forceRefresh;
    };

    var displayTraceTable = function (forceRefresh) {
        var traces = filterTraces(sampling.traces);
        var maxDuration = sampling.httpFilterMaxDuration || sampling.maxDuration;
        var i, l = traces.length, trace, row, rows = [];
        if (maxDuration <= 500) {
            maxDuration = 500;
        } else {
            maxDuration = Math.ceil(maxDuration / 1000) * 1000;
        }
        setDurationScale(maxDuration);

        Opentip.styles.tag = {
            showOn: 'mouseover',
            delay: 0.8
        };
        if (forceRefresh) {
            $('.lt-http-req-table tbody tr').remove();
        }

        $('.lt-request-label').text(l + ' Requests');
        var addedRows = $('.lt-http-req-table tbody tr').not('.lt-http-req-details').length;
        for (i = addedRows; i < l; i++) {
            trace = traces[i];
            row = traceToRow(trace, maxDuration).addClass(i % 2 === 0 ? 'lt-even' : 'lt-odd');
            rows.push(row);
            if (!!selectedTraceIds[trace.id]) {
                selectedTraceIds[trace.id] = row;
            }
        }

        setTableHeight();
        $('.lt-http-req-table tbody').append(rows);

        Object.keys(selectedTraceIds).forEach(function (traceId) {
            selectRow(traceId, selectedTraceIds[traceId]);
        });
    };

    var setTableHeight = function () {
        var h = $('.lt-http-requests').height();
        $('.lt-http-req-table tbody').css('max-height', (h - 24) + 'px');
    };

    var traceToRow = function (trace, maxDuration) {
        var tr = $('<tr>')
            .on('click', rowClick)
            .data('t', trace.children)
            .data('md', maxDuration)
            .data('s', new Date(trace.start))
            .data('id', trace.id);
        var traceData = trace.data || {};
        var isWS = isWebSocket(trace);
        var wsStatus = isWS ? getWSStatus(trace) : '';

        var tdArrow = $('<span class="lt-more-icon">&#9654;</span>');
        var statusText = isWS ? '101' : (traceData.status || '');
        var tdStatus = $('<td>').append(tdArrow).append(document.createTextNode(statusText));
        if (!trace.children || trace.children.length === 0) {
            tdArrow.css('visibility', 'hidden');
        }
        var tdMethod = $('<td>').text(traceData.method || '');
        var tdPath = $('<td>');
        if (traceData.url) {
            tdPath.text(traceData.url.substring(traceData.url.indexOf('://') + 3));
        } else {
            tdPath.text(traceData.path || '');
        }

        if (traceData.path && traceData.path.length > 40) {
            var tooltip = splitLine(traceData.path, 55);
            new Opentip(tdPath.get(0), tooltip, {style: "tag"});
        }
        var tdType = $('<td>');
        if (isWS) {
            tdType.text('WebSocket');
            tdType.toggleClass('lt-ws-open', wsStatus === 'open');
        } else {
            tdType.text(traceData.type || '');
        }
        var tdSize = $('<td>').text(formatSize(traceData.size));
        var tdDuration = $('<td>');
        if (timeDurationMode === 'duration') {
            tdDuration.text(trace.duration + ' ms');
        } else {
            tdDuration.text(formatTimeWithMillis(new Date(trace.start)));
        }
        var tdTimeBar = $('<td colspan="4">');

        var barWidth = Math.ceil((trace.duration / maxDuration) * 100);
        var bar = makeBar(barWidth, 0, traceSpeed(trace.duration));
        tdTimeBar.append(bar);
        tr.append([tdStatus, tdMethod, tdPath, tdType, tdSize, tdDuration, tdTimeBar]);
        return tr;
    };

    var makeBar = function (widthPercent, offset, clz, level) {
        var bar = $('<div class="lt-progress-bar horizontal">');
        var track = $('<div class="lt-progress-track">');
        var fill = $('<div class="lt-progress-fill">').css('width', widthPercent + '%').addClass(clz);
        if (level) {
            fill.addClass('level' + level);
        }
        if (offset) {
            fill.css('left', offset + '%');
        }

        track.append(fill);
        bar.append(track);
        return bar;
    };

    var setDurationScale = function (d) {
        var f = function (v) {
            return (v % 1000) === 0 ? (v / 1000) + ' s' : v + ' ms';
        };
        $('#timecol1').text(f(d / 4));
        $('#timecol2').text(f((d / 4) * 2));
        $('#timecol3').text(f((d / 4) * 3));
        $('#timecol4').text(f(d));
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

    var selectRow = function (traceId, $row) {
        selectedTraceIds[traceId] = $row;
        if ($row.hasClass('lt-http-sel')) {
            return;
        }
        $row.addClass('lt-http-sel');
        $row.find('.lt-more-icon').html('&#9660;');

        var subTraces = $row.data('t');
        if (!subTraces || subTraces.length === 0) {
            return;
        }
        var maxDuration = $row.data('md');
        var oddEven = $row.hasClass('lt-even') ? 'lt-even' : 'lt-odd';
        var parentStart = $row.data('s');

        var head = $(
            '<tr class="lt-http-req-details lt-http-sel lt-sub-header">' +
            '<td>Trace</td>' +
            '<td></td>' +
            '<td>Script / Class</td>' +
            '<td>Application</td>' +
            '<td></td>' +
            '<td></td>' +
            '<td class="lt-http-req-sub-time" colspan="4">Execution time</td>' +
            '</tr>')
            .addClass(oddEven).data('id', traceId);

        var i, l, traces = [], bodyTr, bodyTrs = [head];
        flattenTraces(subTraces, traces);
        for (i = 0, l = traces.length; i < l; i++) {
            bodyTr = subtraceToRow(traces[i], maxDuration, parentStart);
            bodyTr.addClass(oddEven).addClass('lt-http-sel').data('id', traceId);
            bodyTrs.push(bodyTr);
        }
        $row.after(bodyTrs);
    };

    var unselectRow = function (traceId, $row) {
        delete selectedTraceIds[traceId];

        $('.lt-http-req-details').filter(function () {
            return $(this).data("id") === traceId;
        }).remove();
        $row.find('.lt-more-icon').html('&#9654;');
        $row.removeClass('lt-http-sel');
    };

    var rowClick = function (e) {
        var $this = $(this);
        var traceId = $this.data('id');
        var wasSelected = !!selectedTraceIds[traceId];

        if (wasSelected) {
            unselectRow(traceId, $this);
        } else {
            selectRow(traceId, $this);
        }
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

        var tr = $('<tr class="lt-http-req-details">');
        var traceText = '', traceSize = '', traceMethod = '';
        if (trace.name === 'renderComponent') {
            traceText = capitalize(traceData.type);
            script = traceData.contentPath || traceData.componentPath;
        } else if (trace.name === 'renderFilter') {
            traceText = capitalize(traceData.type);
            app = traceData.app;
            script = traceData.name;
        } else if (trace.name === 'controllerScript') {
            traceText = 'Script';
        } else if (trace.name === 'renderApp') {
            traceText = 'App';
            app = traceData.app;
            script = traceData.script || traceData.path;
        } else if (trace.name === 'websocket') {
            traceText = 'WS';
            app = traceData.type;
            script = traceData.message || '';
        } else if (traceData.traceName) {
            traceText = traceData.traceName;
            script = traceData.url || traceData.path;
            traceSize = formatSize(traceData.size);
            traceMethod = traceData.method || '';
            app = traceData.type;
        }
        var tdTrace = $('<td>').text(traceText);
        var tdMethod = $('<td>').text(traceMethod);
        var tdScriptClass = $('<td>').text(script).css('padding-left', trace.l * 8 + 'px');
        if (script && script.length > 40) {
            var tooltip = splitLine(script, 55);
            new Opentip(tdScriptClass.get(0), tooltip, {style: "tag"});
        }

        var tdApp = $('<td>').text(app || '');
        var tdSize = $('<td>').text(traceSize);
        var tdDuration = $('<td>').text(trace.duration + ' ms');
        var tdTimeBar = $('<td colspan="4">');

        var offset = new Date(trace.start).getTime() - parentStart.getTime();
        var offsetWidth = Math.ceil((offset / maxDuration) * 100);
        var barWidth = Math.ceil((trace.duration / maxDuration) * 100);
        var bar = makeBar(barWidth, offsetWidth, '', trace.l);
        tdTimeBar.append(bar);
        tr.append([tdTrace, tdMethod, tdScriptClass, tdApp, tdSize, tdDuration, tdTimeBar]);
        return tr;
    };

    var capitalize = function (v) {
        return v && v.length ? v.charAt(0).toUpperCase() + v.slice(1) : '';
    };

    // Request Rate
    var initRequestRateData = function () {
        let $chartCnt = $('.lt-request-chart-cnt');
        var h = $chartCnt.height();
        $chartCnt.css('min-height', h + 'px');

        var elW = $ltRequestChart.width();
        requestRate.chartBarWidth = Math.floor((elW - 2) / REQ_RATE_BAR_COUNT) - 1;
        requestRate.chartHeight = Math.floor(h - 20);
        if (!requestRate.data) {
            requestRate.data = [];
            for (var i = 0; i < REQ_RATE_BAR_COUNT; i++) {
                requestRate.data.push(0);
            }
        }
        $('.lt-request-rate-max').text(requestRate.yScale + ' r/s');
    };

    var handleNewRequestRate = function (reqPerSec) {
        reqPerSec = Math.ceil(reqPerSec);
        $('.lt-request-rate-current span').text(reqPerSec);
        // console.log('REQ: ' + reqPerSec);
        requestRate.data.shift();
        requestRate.data.push(reqPerSec);

        if (reqPerSec > requestRate.yScale) {
            requestRate.yScale = reqPerSec + (10 - reqPerSec % 10);
            $('.lt-request-rate-max').text(requestRate.yScale + ' r/s');
            console.log('New Req max: ' + requestRate.yScale);
        } else {
            checkDownScale();
        }
    };

    var checkDownScale = function () {
        var t = requestRate.rescaleCheck || 0;
        var n = new Date().getTime();
        if (n - t > 10000) {
            var max = 0;
            for (var i = 0, l = requestRate.data.length; i < l; i++) {
                if (requestRate.data[i] > max) {
                    max = requestRate.data[i];
                }
            }
            max = max + (10 - max % 10);
            if (max < requestRate.yScale) {
                requestRate.yScale = max;
                $('.lt-request-rate-max').text(requestRate.yScale + ' r/s');
                console.log('New Req max: ' + requestRate.yScale);
            }

            requestRate.rescaleCheck = new Date().getTime();
        }
    };

    var redrawRequestRate = function () {
        var data = requestRate.data;
        $ltRequestChart.sparkline(data, {
            type: 'bar',
            width: '100%',
            chartRangeMax: requestRate.yScale,
            height: requestRate.chartHeight,
            barWidth: requestRate.chartBarWidth,
            barSpacing: 1,
            tooltipSuffix: ' req/sec'
        });
    };

    var isWebSocket = function (trace) {
        return !!trace.data.websocket;
    };

    var getWSStatus = function (trace) {
        if (!trace.children || trace.children.length === 0) {
            return '';
        }
        var child, status = '';
        for (var i = 0, l = trace.children.length; i < l; i++) {
            child = trace.children[i];
            if (child.name === 'websocket') {
                if (child.data.type === 'open') {
                    status = 'open';
                } else if (child.data.type === 'close') {
                    status = 'closed';
                    break;
                }
            }
        }
        return status;
    };

    var splitLine = function (text, maxLength) {
        if (text == null) {
            return '';
        }
        if (text.length <= maxLength) {
            return text;
        }
        var p = text.lastIndexOf('/', maxLength);
        if (p <= 0 || p > maxLength) {
            p = maxLength;
        }
        return text.slice(0, p) + "\r\n" + splitLine(text.slice(p), maxLength);
    };

    var quantityWord = function (value, zero, one, more) {
        return value === 0 ? zero : value === 1 ? one : more;
    };

    var formatTimeWithMillis = function (t) {
        return zeroPad(t.getHours(), 2) + ':' + zeroPad(t.getMinutes(), 2) + ':' + zeroPad(t.getSeconds(), 2) + '.' +
               zeroPad(t.getMilliseconds(), 3);
    };

    function zeroPad(n, width) {
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
    }

}($, SVC_URL));
