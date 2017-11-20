"use strict";
(function ($, svcUrl) {

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

    class TraceTable {
        constructor() {
            this.traces = [];
            this.maxDuration = 500;
            this.httpFilterMaxDuration = null;
            this.httpFilterType = '';
            this.httpFilterUrl = '';
            this.shouldRefresh = false;
            this.httpFilters = this.initHttpFilters();
        }

        clear() {
            this.traces = [];
            this.maxDuration = 500;
        }

        setFilterType(filterType) {
            this.httpFilterType = filterType;
        }

        setFilterUrl(filterUrl) {
            this.httpFilterUrl = filterUrl;
        }

        addTraceData(traceElements, maxDuration) {
            this.shouldRefresh = this.extractSubtraces(traceElements, maxDuration);

            this.maxDuration = Math.max(this.maxDuration, maxDuration);

            var traces = traceElements.map((t) => new Trace(t, null, this.maxDuration));
            this.traces = this.traces.concat(traces);

            this.httpFilterMaxDuration = null;
        }

        extractSubtraces(traces, maxDuration) {
            var forceRefresh = false, t, pt, trace, parentTrace;
            for (t = traces.length - 1; t >= 0; t--) {
                trace = traces[t];
                if (trace.data.parentId) {
                    traces.splice(t, 1);
                    forceRefresh = true;
                    for (pt = 0; pt < this.traces.length; pt++) {
                        parentTrace = this.traces[pt];
                        if (parentTrace.trace.id === trace.data.parentId) {
                            parentTrace.trace.children = (parentTrace.trace.children || []);
                            parentTrace.trace.children.push(trace);
                            parentTrace.children.push(new Trace(trace, parentTrace, maxDuration, parentTrace.level + 1));
                            break;
                        }
                    }
                    if (trace.children) {
                        this.extractSubtraces(trace.children);
                    }
                }
            }
            return forceRefresh;
        }

        forceRefresh() {
            this.shouldRefresh = true;
        }

        display() {
            var traces = this.filterTraces();
            var maxDuration = this.httpFilterMaxDuration || this.maxDuration;
            var i, l = traces.length, trace, rows = [];
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
            if (this.shouldRefresh) {
                $('.lt-http-req-table tbody tr').remove();
            }

            $('.lt-request-label').text(l + ' Requests');
            var addedRows = $('.lt-http-req-table tbody tr').not('.lt-http-req-details').length;
            for (i = addedRows; i < l; i++) {
                trace = traces[i];
                trace.initTrace();
                rows.push(trace.$row);
            }

            setTableHeight();
            $('.lt-http-req-table tbody').append(rows);

            // Object.keys(selectedTraceIds).forEach(function (traceId) {
            //     selectRow(traceId, selectedTraceIds[traceId]);
            // });
            this.shouldRefresh = false;
        }

        initHttpFilters() {
            var self = this;
            return {
                'all': null,
                'page': function (t) {
                    var tData = t.trace.data;
                    var p = tData.rawpath || tData.path;
                    return tData.type && tData.type.indexOf('text/html') > -1 && !(p && p.indexOf('/_/') > -1);
                },
                'component': function (t) {
                    var tData = t.trace.data;
                    var p = tData.rawpath || tData.path;
                    return p && p.indexOf('/_/component/') > -1;
                },
                'service': function (t) {
                    var tData = t.trace.data;
                    var p = tData.rawpath || tData.path;
                    return p && p.indexOf('/_/service/') > -1;
                },
                'asset': function (t) {
                    var tData = t.trace.data;
                    var p = tData.rawpath || tData.path;
                    return p && p.indexOf('/_/asset/') > -1;
                },
                'image': function (t) {
                    var tData = t.trace.data;
                    var p = tData.rawpath || tData.path;
                    return p && p.indexOf('/_/image/') > -1;
                },
                'ws': function (t) {
                    return t.isWebSocket();
                },
                'other': function (t) {
                    return !self.httpFilters.page(t) && !self.httpFilters.component(t) && !self.httpFilters.service(t) &&
                           !self.httpFilters.asset(t) && !self.httpFilters.image(t) && !self.httpFilters.ws(t);
                }
            }
        };

        filterTraces() {
            var traces = this.traces;
            this.httpFilterMaxDuration = null;
            var f = this.httpFilters[this.httpFilterType];
            var filterSet = !!f, searchSet = this.httpFilterUrl !== '';
            if (!filterSet && !searchSet) {
                return traces;
            }

            var maxDuration = 0;

            var self = this;
            traces = traces.filter(function (t) {
                var r = (!filterSet || f(t)) && (!searchSet || (t.path().indexOf(self.httpFilterUrl) > -1));
                if (r && (t.duration() > maxDuration)) {
                    maxDuration = t.duration();
                }
                return r;
            });

            this.httpFilterMaxDuration = maxDuration;

            return traces;
        }

    }

    class Trace {
        constructor(trace, parent, maxDuration, level) {
            this.trace = trace;
            this.parent = parent;
            this.$row = null;
            this.$rowHeader = null;
            this.level = level || 0;
            this.maxDuration = maxDuration;
            this.expanded = false;
            this.visible = false;
            this.children = [];
            trace.children = trace.children || [];
            for (let i = 0; i < trace.children.length; i++) {
                this.children.push(new Trace(trace.children[i], this, maxDuration, this.level + 1));
            }
        }

        id() {
            return this.trace.id;
        }

        path() {
            return this.trace.data.path || '';
        }

        duration() {
            return this.trace.duration;
        }

        isWebSocket() {
            return !!this.trace.data.websocket;
        }

        getWSStatus() {
            var trace = this.trace;
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
        }

        initTrace() {
            var trace = this.trace;
            var tr = $('<tr>')
                .addClass('lt-http-request')
                .on('click', {self: this}, this.rowClick)
                .data('s', new Date(trace.start))
                .data('id', trace.id);
            var traceData = trace.data || {};
            var isWS = this.isWebSocket();
            var wsStatus = isWS ? this.getWSStatus(trace) : '';

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

            var barWidth = Math.ceil((trace.duration / this.maxDuration) * 100);
            var bar = this.makeBar(barWidth, 0, traceSpeed(trace.duration));
            tdTimeBar.append(bar);
            tr.append([tdStatus, tdMethod, tdPath, tdType, tdSize, tdDuration, tdTimeBar]);
            this.$row = tr;
        }

        makeBar(widthPercent, offset, clz, level) {
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
        }

        rowClick(e) {
            var self = e.data.self;
            if (self.expanded) {
                self.unselectRow();
            } else {
                self.selectRow();
            }
            self.expanded = !self.expanded;
        }

        unselectRow() {
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].removeSubTrace();
            }
            if (this.$rowHeader) {
                this.$rowHeader.remove();
            }
            this.$row.find('.lt-more-icon').html('&#9654;');
            if (!this.parent) {
                this.$row.removeClass('lt-http-sel');
            }
        }

        selectRow() {
            var $row = this.$row;
            $row.addClass('lt-http-sel');
            $row.find('.lt-more-icon').html('&#9660;');

            var subTraces = this.children;
            if (subTraces.length === 0) {
                return;
            }

            var childrenRows = [];
            if (this.level == 0) {
                this.$rowHeader = $(
                    '<tr class="lt-http-req-details lt-http-sel lt-sub-header">' +
                    '<td>Trace</td>' +
                    '<td></td>' +
                    '<td>Script / Class</td>' +
                    '<td>Application</td>' +
                    '<td></td>' +
                    '<td></td>' +
                    '<td class="lt-http-req-sub-time" colspan="4">Execution time</td>' +
                    '</tr>');
                childrenRows.push(this.$rowHeader);
            }

            this.addSubTraces(childrenRows);
            $row.after(childrenRows);
        }

        removeSubTrace() {
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].removeSubTrace();
            }
            if (this.$row) {
                this.$row.remove();
                this.$row = null;
            }
        }

        baseStart() {
            if (this.parent) {
                return this.parent.baseStart();
            }
            return new Date(this.trace.start);
        }

        addSubTraces($trs) {
            var parentStart = this.baseStart();
            var traceChild;
            for (var i = 0, l = this.children.length; i < l; i++) {
                traceChild = this.children[i];
                traceChild.initChildTrace(parentStart);
                traceChild.$row.addClass('lt-http-sel');
                $trs.push(traceChild.$row);
            }
        }

        initChildTrace(parentStart) {
            var trace = this.trace || {};
            var traceData = trace.data || {};
            var script = traceData.script, app = '';
            if (script) {
                var p = traceData.script.indexOf(':');
                if (p > -1) {
                    app = script.substring(0, p);
                    script = script.substring(p + 1);
                }
            }

            var tr = $('<tr class="lt-http-req-details">').on('click', {self: this}, this.rowClick);
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
            } else if (trace.name.indexOf('.') > 0) {
                traceText = trace.name.substr(0, trace.name.indexOf('.'));
                traceMethod = trace.name.substring(trace.name.indexOf('.') + 1);
                script = traceData.path || traceData.id;
                if (traceData.query) {
                    script = traceData.query + ', from=' + traceData.from + ', size=' + traceData.size + ', hits=' + traceData.hits;
                }
                if (traceData.parent) {
                    script = traceData.parent + ', from=' + traceData.from + ', size=' + traceData.size + ', hits=' + traceData.hits;
                }
                app = traceData.stack;
            }
            var tdArrow = $('<span class="lt-more-icon">&#9654;</span>').css('padding-left', (this.level * 4 ) + 'px');
            var tdTrace = $('<td>').append(tdArrow).append(document.createTextNode(traceText));
            if (!trace.children || trace.children.length === 0) {
                tdArrow.css('visibility', 'hidden');
            }
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
            var offsetWidth = Math.ceil((offset / this.maxDuration) * 100);
            var barWidth = Math.ceil((trace.duration / this.maxDuration) * 100);
            var bar = this.makeBar(barWidth, offsetWidth, '', this.level);
            tdTimeBar.append(bar);
            tr.append([tdTrace, tdMethod, tdScriptClass, tdApp, tdSize, tdDuration, tdTimeBar]);
            this.$row = tr;
        }
    } // Trace

    var requestConn = null, samplingConn = null, wsAvailable = false;
    var samplingId, samplingIntervalId = 0, samplingCount = 0;
    var traceTable = new TraceTable();
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
            traceTable.display();
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
        traceTable.clear();

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

        traceTable.addTraceData(msg.traces, msg.maxDuration);

        $('.lt-http-sampling-message').hide();
        $('.lt-http-requests').show();
        clearInterval(samplingIntervalId);
        samplingIntervalId = 0;

        traceTable.display();
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
        traceTable.setFilterUrl($('#filterUrl').val().trim());
        traceTable.forceRefresh();
        traceTable.display();
    };

    var httpApplyFilter = function (e) {
        $('.lt-http-toolbar .lt-active').removeClass('lt-active');
        $(this).addClass('lt-active').blur();

        traceTable.setFilterType(e.data.t);
        traceTable.setFilterUrl($('#filterUrl').val().trim());
        traceTable.forceRefresh();
        traceTable.display();
    };

    var toggleTime = function (e) {
        timeDurationMode = timeDurationMode === 'duration' ? 'time' : 'duration';
        traceTable.forceRefresh();
        traceTable.display();
    };

    var setTableHeight = function () {
        var h = $('.lt-http-requests').height();
        $('.lt-http-req-table tbody').css('max-height', (h - 24) + 'px');
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

    // TODO refactor, formatters by trace.name
    var formatSubtrace = function (trace) {
        for (var i = 0, l = subtraceFormatters.length; i < l; i++) {

        }
    };

    var subtraceFormatters = [
        {
            match: function (trace) {

            },
            format: function (trace) {

            }
        }
    ];

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
