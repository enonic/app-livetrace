"use strict";
(function ($, svcUrl) {

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

    var capitalize = function (v) {
        return v && v.length ? v.charAt(0).toUpperCase() + v.slice(1) : '';
    };

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
            this.keepAliveIntervalId = setInterval(() => {
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
    } // class WebSocketConnection

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
            this.shouldRefresh = this.extractTaskTraces(traceElements) || this.shouldRefresh;

            this.maxDuration = Math.max(this.maxDuration, maxDuration);

            var traces = traceElements.map((t) => new Trace(t, null, this.maxDuration));
            this.traces = this.traces.concat(traces);

            this.httpFilterMaxDuration = null;
        }

        extractTaskTraces(traces) {
            var forceRefresh = false, t, pt, trace, parentTrace;
            for (t = traces.length - 1; t >= 0; t--) {
                trace = traces[t];
                if (trace.name === 'task.run') {
                    for (pt = 0; pt < this.traces.length; pt++) {
                        parentTrace = this.traces[pt];
                        if (parentTrace.trace.id === trace.id) {
                            parentTrace.trace.children = (parentTrace.trace.children || []);
                            parentTrace.trace.children.push(trace.children || []);
                            if (trace.children) {
                                trace.children.forEach(function (ct) {
                                    parentTrace.children.push(new Trace(ct, parentTrace, parentTrace.maxDuration, parentTrace.level + 1));
                                });
                            }

                            traces.splice(t, 1);
                            forceRefresh = true;
                            break;
                        }
                    }
                }
            }
            return forceRefresh;
        }

        extractSubtraces(traces, maxDuration) {
            // place traces from websocket requests
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
            // this.shouldRefresh ?
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
                trace.setMaxDuration(maxDuration);
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
                    return tData.type && tData.type.indexOf('text/html') > -1 && !(p && p.indexOf('/_/') > -1) &&
                           !(tData.type === 'mapping');
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
            traces = traces.filter((t) => {
                var r = (!filterSet || f(t)) && (!searchSet || (t.path().indexOf(self.httpFilterUrl) > -1));
                if (r && (t.duration() > maxDuration)) {
                    maxDuration = t.duration();
                }
                return r;
            });

            this.httpFilterMaxDuration = maxDuration;

            return traces;
        }

    } // class TraceTable

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

        setMaxDuration(maxDuration) {
            this.maxDuration = maxDuration;
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].setMaxDuration(maxDuration);
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
                var url = traceData.url.substring(traceData.url.indexOf('://') + 3);
                tdPath.append($('<a target="_blank"/>').attr('href', traceData.url).text(url));
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
            this.resetExpand();
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

        resetExpand() {
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].resetExpand();
                this.expanded = false;
            }
        }

        rowClick(e) {
            e.preventDefault();
            var self = e.data.self;
            if (self.expanded) {
                self.unselectRow();
            } else {
                if (e.shiftKey) {
                    self.expandAll();
                } else {
                    self.selectRow();
                }
            }
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
            this.resetExpand();
            this.expanded = false;
        }

        selectRow() {
            if (this.expanded) {
                this.unselectRow();
            }
            var subTraces = this.children;
            if (subTraces.length === 0) {
                return;
            }

            var $row = this.$row;
            $row.addClass('lt-http-sel');
            $row.find('.lt-more-icon').html('&#9660;');


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
            this.expanded = true;
        }

        expandAll() {
            this.selectRow();
            this.children.forEach((ch) => ch.expandAll());
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
            var traceText = trace.name, traceSize = '', traceMethod = '';
            if (trace.name === 'renderComponent') {
                // traceText = capitalize(traceData.type);
                traceMethod = traceData.type || '';
                script = traceData.contentPath || traceData.componentPath;
            } else if (trace.name === 'renderFilter') {
                // traceText = capitalize(traceData.type);
                app = traceData.app;
                script = traceData.name;
            } else if (trace.name === 'controllerScript') {
                // traceText = 'Script';
            } else if (trace.name === 'renderApp') {
                // traceText = 'App';
                app = traceData.app;
                script = traceData.script || traceData.path;
            } else if (trace.name === 'websocket') {
                // traceText = 'WS';
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
                if (traceData.query || traceData.filter) {
                    script = ['query=' + traceData.query, 'types=' + traceData.contentTypes, 'filter=' + traceData.filter,
                        'from=' + traceData.from, 'size=' + traceData.size,
                        'hits=' + traceData.hits].join(', ');
                } else if (traceData.parent) {
                    script =
                        ['parent=' + traceData.parent, 'from=' + traceData.from, 'size=' + traceData.size, 'hits=' + traceData.hits].join(
                            ', ');
                }
                app = traceData.stack;
            }
            var tdArrow = $('<span class="lt-more-icon">&#9654;</span>').css('padding-left', (this.level * 6) + 'px');
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
    } // class Trace

    class Task {
        constructor(taskJson) {
            this.table = null;
            this.id = taskJson.id;
            this.name = taskJson.name;
            this.description = taskJson.description;
            this.state = taskJson.state;
            this.info = taskJson.progress.info;
            this.current = taskJson.progress.current;
            this.total = taskJson.progress.total;
            this.app = taskJson.application;
            this.user = this.userText(taskJson.user);
            this.startTime = new Date(taskJson.startTime);
            this.$row = null;
            this.$status = null;
            this.$statusText = null;
            this.$description = null;
            this.$name = null;
            this.$started = null;
            this.$app = null;
            this.$user = null;
            this.$info = null;
            this.$progress = null;
            this.$progressBar = null;
            this.$progressText = null;
            this.timerId = null;
        }

        userText(user) {
            return user.substring(user.indexOf(":") + 1);
        }

        createRow() {
            this.$row = $('<tr/>');
            this.$statusText = $('<span/>');
            this.$status = $('<td/>').append(this.$statusText);
            this.$description = $('<td/>');
            this.$name = $('<td/>');
            this.$started = $('<td/>');
            this.$app = $('<td/>');
            this.$user = $('<td/>');
            this.$info = $('<td/>');
            this.$progress = $('<td/>');
            this.$progressBar = $('<div class="lt-progress-bar horizontal">');
            var track = $('<div class="lt-progress-track">');
            var fill = $('<div class="lt-progress-fill">').css('width', '0%');
            track.append(fill);
            this.$progressBar.append(track);
            this.$progressText = $('<span/>').hide();
            this.$progress.append(this.$progressBar).append(this.$progressText);

            var $row = $('<tr/>')
                .append([this.$status, this.$name, this.$description, this.$started, this.$app, this.$user, this.$info, this.$progress]);
            this.$row = $row;
            this.refreshDisplay();
            this.timerId = setInterval(this.refreshTime.bind(this), 2000);
        }

        getRow() {
            if (!this.$row) {
                this.createRow();
            }
            return this.$row;
        }

        refreshTime() {
            var time = '';
            if (this.table && this.table.viewTimeHumanized) {
                time = moment(this.startTime).fromNow();
            } else {
                time = moment(this.startTime).format('YYYY-MM-DD HH:mm:ss');
            }
            this.$started.text(time);
        }

        refreshProgress() {
            if (this.total === 0 || this.table.viewProgressText) {
                this.$progress.find('span').text(this.total > 0 ? this.current + ' / ' + this.total : '');
                this.$progressBar.hide();
                this.$progressText.show();
            } else {
                var widthPercent = Math.ceil((this.current / this.total) * 100);
                this.$progress.find('.lt-progress-fill').css('width', widthPercent + '%');
                this.$progressBar.show();
                this.$progressText.hide();
            }
        }

        refreshDisplay() {
            if (!this.$row) {
                return;
            }
            var state = this.state.toLowerCase();
            this.$statusText.text(capitalize(state)).removeClass().addClass('lt-task-state').addClass('lt-task-state-' + state);
            this.$name.text(this.name);
            this.$description.text(this.description);
            this.refreshTime();
            this.$app.text(this.app);
            this.$user.text(this.user);
            this.$info.text(this.info);
            this.refreshProgress();
            // get app icon, displayname
        }

        remove() {
            if (this.$row) {
                this.$row.remove();
            }
            clearInterval(this.timerId);
        }

        updateFrom(task) {
            this.id = task.id;
            this.name = task.name;
            this.description = task.description;
            this.state = task.state;
            this.info = task.info;
            this.current = task.current;
            this.total = task.total;
            this.app = task.app;
            this.user = task.user;
            this.startTime = task.startTime;
        }
    } // class Task

    class TaskTable {

        constructor($table) {
            this.tasks = {};
            this.taskIds = [];
            this.$table = $table;
            this.$tbody = $table.find('tbody');
            this.viewTimeHumanized = true;
            this.viewProgressText = false;
        }

        setTasks(tasks) {
            this.tasks = {};
            this.taskIds = [];
            var task, i;
            for (i = 0; i < tasks.length; i++) {
                task = tasks[i];
                this.taskIds.push(task.id);
                this.tasks[task.id] = task;
                task.table = this;
            }
            this.display();
        }

        updateTask(task) {
            if (this.taskIds.indexOf(task.id) < 0) {
                this.tasks[task.id] = task;
                this.taskIds.push(task.id);
                task.table = this;
                this.display();

            } else {
                var existingTask = this.tasks[task.id];
                if (existingTask) {
                    existingTask.updateFrom(task);
                    existingTask.refreshDisplay();
                } else {
                    console.error('Could not find task to update', task);
                }
            }
        }

        removeTask(taskId) {
            var task = this.tasks[taskId];
            delete this.tasks[taskId];
            this.taskIds = this.taskIds.filter((id) => id !== taskId);
            if (task) {
                task.remove();
            }
        }

        display() {
            var taskRows = [];
            var self = this;
            this.taskIds.forEach((id) => {
                taskRows.push(self.tasks[id].getRow());
            });

            this.$tbody.empty().append(taskRows);
        }

        toggleTimeView() {
            this.viewTimeHumanized = !this.viewTimeHumanized;
            var task, i;
            for (i = 0; i < this.taskIds.length; i++) {
                task = this.tasks[this.taskIds[i]];
                task.refreshTime();
            }
        }

        toggleProgressView() {
            this.viewProgressText = !this.viewProgressText;
            var task, i;
            for (i = 0; i < this.taskIds.length; i++) {
                task = this.tasks[this.taskIds[i]];
                task.refreshProgress();
            }
        }

    } // TaskTable


    class Tab {
        constructor(id, tabButId, taskContainerId) {
            this.id = id;
            this.$button = $('#' + tabButId);
            this.$container = $('#' + taskContainerId);
        }

        select() {
            this.$button.addClass('lt-tab-selected');
            this.$container.addClass('lt-tab-container-selected');
        }

        unselect() {
            this.$button.removeClass('lt-tab-selected');
            this.$container.removeClass('lt-tab-container-selected');
        }
    } // Tab

    class TabManager {
        constructor() {
            this.tabs = [];
            this.tabsById = {};
        }

        addTab(tab) {
            this.tabs.push(tab);
            this.tabsById[tab.id] = tab;
            const self = this;
            tab.$button.on('click', () => {
                self.show(tab.id);
            });
        }

        show(tabId) {
            let tabs = this.tabs, tab;
            for (let i = 0, l = tabs.length; i < l; i++) {
                tab = tabs[i];
                if (tab.id === tabId) {
                    tab.select();
                } else {
                    tab.unselect();
                }
            }
        }
    } // TabManager

    const colors = {
        green: {
            fill: '#e0eadf',
            stroke: '#5eb84d',
        },
        lightBlue: {
            stroke: '#6fccdd',
        },
        darkBlue: {
            fill: '#92bed2',
            stroke: '#3282bf',
        },
        purple: {
            fill: '#8fa8c8',
            stroke: '#75539e',
        },
    };

    const MAX_POINTS = 50;

    class MemoryChart {
        constructor(elementId) {
            this.ctx = document.getElementById(elementId).getContext('2d');
            this.chart = null;
            this.maxPoints = MAX_POINTS;
        }

        init() {
            this.chart = new Chart(this.ctx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: "Heap memory committed",
                        data: [],
                        type: 'line',
                        borderColor: '#2a8ccd',
                        backgroundColor: '#e8f4fc',
                        fill: true,
                        lineTension: 0,
                        borderWidth: 2,
                        pointStyle: 'circle',
                        pointRadius: 3,
                        pointBorderWidth: 1,
                        pointBackgroundColor: '#2a8ccd',
                    }]
                },
                options: {
                    scales: {
                        xAxes: [{
                            type: 'time',
                            distribution: 'linear', // 'series'
                            ticks: {
                                // source: 'labels'
                            },
                            time: {
                                unit: 'second',
                                displayFormats: {
                                    second: 'hh:mm:ss'
                                }
                            },
                            gridLines: {
                                // display:false,
                                drawOnChartArea: false,
                                drawTicks: true,

                            }
                        }],
                        yAxes: [{
                            scaleLabel: {
                                display: true,
                                labelString: 'Memory in MB'
                            }
                        }]
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        addPoint(x, y) {
            let point = {x: x, y: y};
            var maxPoints = this.maxPoints;

            if (this.chart) {
                var dataset = this.chart.data.datasets[0];
                if (dataset.data.length >= maxPoints) {
                    dataset.data.pop();
                }
                dataset.data.push(point);
                this.chart.update();
            }
        }

    } // MemoryChart

    class RequestsChart {
        constructor(elementId) {
            this.ctx = document.getElementById(elementId).getContext('2d');
            this.chart = null;
            this.maxPoints = MAX_POINTS;
        }

        init() {
            this.chart = new Chart(this.ctx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: "HTTP Requests/second",
                        data: [],
                        type: 'line',
                        borderColor: colors.darkBlue.stroke,
                        backgroundColor: colors.darkBlue.fill,
                        fill: true,
                        lineTension: 0,
                        borderWidth: 2,
                        pointStyle: 'circle',
                        pointRadius: 3,
                        pointBorderWidth: 1,
                        pointBackgroundColor: colors.darkBlue.stroke,
                    }]
                },
                options: {
                    scales: {
                        xAxes: [{
                            type: 'time',
                            distribution: 'linear', // 'series'
                            time: {
                                unit: 'second',
                                displayFormats: {
                                    second: 'hh:mm:ss'
                                }
                            },
                            gridLines: {
                                // display:false,
                                drawOnChartArea: false,
                                drawTicks: true,

                            }
                        }],
                        yAxes: [{
                            scaleLabel: {
                                display: true,
                                labelString: 'Req/sec'
                            }
                        }]
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        addPoint(x, y) {
            let point = {x: x, y: y};
            var maxPoints = this.maxPoints;

            if (this.chart) {
                var dataset = this.chart.data.datasets[0];
                if (dataset.data.length >= maxPoints) {
                    dataset.data.pop();
                }
                dataset.data.push(point);
                this.chart.update();
            }
        }

    } // RequestsChart

    class ThreadChart {
        constructor(elementId) {
            this.ctx = document.getElementById(elementId).getContext('2d');
            this.chart = null;
            this.maxPoints = MAX_POINTS;
        }

        init() {
            this.chart = new Chart(this.ctx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: "HTTP Threads",
                            data: [],
                            type: 'line',
                            fill: true,
                            backgroundColor: colors.green.fill,
                            pointBackgroundColor: colors.green.stroke,
                            borderColor: colors.green.stroke,
                            pointHighlightStroke: colors.green.stroke,
                            borderCapStyle: 'butt',
                            lineTension: 0,
                        },
                        {
                            label: "Total Threads",
                            data: [],
                            type: 'line',

                            fill: true,
                            backgroundColor: colors.purple.fill,
                            pointBackgroundColor: colors.purple.stroke,
                            borderColor: colors.purple.stroke,
                            pointHighlightStroke: colors.purple.stroke,
                            borderCapStyle: 'butt',
                            lineTension: 0,
                        }
                    ]
                },
                options: {
                    scales: {
                        xAxes: [{
                            type: 'time',
                            distribution: 'linear', // 'series'
                            ticks: {
                                // source: 'labels'
                            },
                            time: {
                                unit: 'second',
                                displayFormats: {
                                    second: 'hh:mm:ss'
                                }
                            },
                            gridLines: {
                                // display:false,
                                drawOnChartArea: false,
                                drawTicks: true,

                            }
                        }],
                        yAxes: [{
                            scaleLabel: {
                                display: true,
                                labelString: '# threads',

                            },
                            stacked: true
                        }]
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        addPoints(x, yPoints) {
            var maxPoints = this.maxPoints;
            if (this.chart) {
                if (this.chart.data.labels.length >= maxPoints) {
                    this.chart.data.labels.pop();
                }
                this.chart.data.labels.push(x);

                for (var p = 0; p < yPoints.length; p++) {
                    var dataset = this.chart.data.datasets[p];

                    if (dataset.data.length >= maxPoints) {
                        dataset.data.pop();
                    }
                    dataset.data.push(yPoints[p]);
                }
                this.chart.update();
            }
        }

    } // ThreadChart

    var tabMan;
    var samplingConn = null, wsAvailable = false;
    var samplingId, samplingIntervalId = 0, samplingCount = 0;
    var traceTable = new TraceTable();
    var timeDurationMode = 'duration';
    var taskTable;

    $(function () {
        tabMan = new TabManager();
        tabMan.addTab(new Tab('dashboard', 'dashboardTabBut', 'dashboardTab'));
        tabMan.addTab(new Tab('http', 'httpTabBut', 'httpTab'));
        tabMan.addTab(new Tab('task', 'taskTabBut', 'taskTab'));
        tabMan.show('dashboard'); // TODO 'http'

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
        $('#taskTimeToggle').on('click', taskTimeToggle);
        $('#taskProgressToggle').on('click', taskProgressToggle);

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

        var wsTestConn = new WebSocketConnection(svcUrl + 'pingws');
        wsTestConn.onError(() => {
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
        wsTestConn.onMessage((msg) => {
            if (msg.action === 'pong') {
                wsAvailable = true;
                $('.lt-http-trace-websocket-message').hide();
                $('.lt-http-requests').show();
                $('#startSampling').show();
                $('#stopSampling').hide();
            }
        });
        wsTestConn.onConnect(() => {
            wsAvailable = true;
            wsTestConn.send({action: 'ping'});
        });
        wsTestConn.connect();

        initTasks();

        window.addEventListener('resize', function (e) {
            traceTable.display();
        });

        initDashboard();
    });

    // DASHBOARD
    var initDashboard = function () {
        var memChart = new MemoryChart('ltDashChartMem');
        var threadChart = new ThreadChart('ltDashChartThreads');
        var requestChart = new RequestsChart('ltDashChartReq');
        var wsDashboardConn = new WebSocketConnection(svcUrl + 'dashboard');
        wsDashboardConn.connect();
        wsDashboardConn.onConnect(() => {
            memChart.init();
            threadChart.init();
            requestChart.init();
        });
        wsDashboardConn.onMessage((msg) => {
            var node = msg.node;
            if (node) {
                $('#nodeName').text(node.nodeName);
                $('#nodeIsMaster').text(node.nodeIsMaster);
                $('#nodeXpVersion').text(node.nodeXpVersion);
                $('#nodeJvm').text(node.nodeJvm);
                $('#nodeJvmVersion').text(node.nodeJvmVersion);
                $('#nodeUptime').text(moment.duration(node.nodeUptime).humanize());
                return;
            }
            var data = msg.data;
            var t = new Date(data.time * 1000);

            var heapCommitted = data.heap.committed || 0;
            var heapCommittedMb = heapCommitted / 1048576;
            memChart.addPoint(t, heapCommittedMb);

            var reqSec = data.requestRate || 0;
            requestChart.addPoint(t, reqSec);

            var threads = data.threads;
            threadChart.addPoints(t, [threads.http, threads.total]);
        });
    };

    // TASKS
    var initTasks = function () {
        taskTable = new TaskTable($('.lt-task-table'));
        var wsTaskConn = new WebSocketConnection(svcUrl + 'tasks');
        wsTaskConn.onMessage(taskInfoReceived);
        wsTaskConn.connect();
    };

    var taskInfoReceived = function (msg) {
        if (msg.tasks) {
            var tasks = msg.tasks.map((taskJson) => new Task(taskJson));
            taskTable.setTasks(tasks);

        } else if (msg.task) {
            var task = new Task(msg.task);
            taskTable.updateTask(task);

        } else if (msg.taskId) {
            taskTable.removeTask(msg.taskId);
        }
    };

    var taskTimeToggle = function (e) {
        taskTable.toggleTimeView();
    };

    var taskProgressToggle = function (e) {
        taskTable.toggleProgressView();
    };

    // HTTP
    var checkAuthenticated = function () {
        $.ajax({
            url: svcUrl + 'status',
            method: "GET"
        }).fail((jqXHR) => {
            if (jqXHR.status === 401) {
                location.reload();
            }
        });
    };

    var startSampling = function () {
        console.log('Start sampling...');
        tabMan.show('http');
        traceTable.clear();

        $('#startSampling').hide();
        $('#stopSampling').show();
        $('.lt-request-label').text('');

        $('.lt-http-requests').hide();
        $('.lt-http-sampling-message').show();
        $('#samplingSeconds').text('...');
        $('.lt-http-req-table tbody tr').remove();

        var samplingStart = new Date();
        samplingIntervalId = setInterval(() => {
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
