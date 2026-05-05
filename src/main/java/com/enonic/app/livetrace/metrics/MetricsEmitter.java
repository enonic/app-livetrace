package com.enonic.app.livetrace.metrics;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.Timer;

import com.enonic.xp.server.ServerInfo;


public class MetricsEmitter
{
    private static final String REQUEST_TIMER_NAME = "jetty.connections.request.time";

    private final ScheduledExecutorService scheduler;

    private final String sessionId;

    private final ClusterInfoReporter clusterInfoReporter;

    private final HttpThreadPoolInfoReporter threadPoolInfoReporter;

    private final Consumer<Object> onData;

    private Instant lastMeasureTime;

    private long lastReqCount;

    public MetricsEmitter( final String sessionId, final HttpThreadPoolInfoReporter threadPoolInfoReporter,
                           final ClusterInfoReporter clusterInfoReporter, final Consumer<Object> onData )
    {
        this.sessionId = sessionId;
        this.clusterInfoReporter = clusterInfoReporter;
        this.threadPoolInfoReporter = threadPoolInfoReporter;
        this.onData = onData;
        this.scheduler = Executors.newSingleThreadScheduledExecutor();
    }

    public void start()
    {
        sendInitialData();
        scheduler.scheduleAtFixedRate( this::sendData, 0, 3, TimeUnit.SECONDS );
    }

    public void stop()
    {
        scheduler.shutdown();
    }

    private void sendInitialData()
    {
        final ServerInfo serverInfo = ServerInfo.get();
        final ClusterInfo clusterInfo = clusterInfoReporter.getInfo();
        ServerInfoMapper serverInfoMapper = new ServerInfoMapper( serverInfo, clusterInfo );
        this.onData.accept( serverInfoMapper );
    }

    private void sendData()
    {
        final Instant now = Instant.now();

        final MemoryMXBean bean = ManagementFactory.getMemoryMXBean();
        final List<MemoryPoolMXBean> memoryPools = ManagementFactory.getMemoryPoolMXBeans();

        final int totalThreadCount = ManagementFactory.getThreadMXBean().getThreadCount();
        final int httpThreadCount = threadPoolInfoReporter.getThreadCount();

        final Timer requestTimer = Metrics.globalRegistry.find( REQUEST_TIMER_NAME ).timer();
        final long reqCount = requestTimer != null ? requestTimer.count() : 0;

        double reqSec = 0;
        if ( lastMeasureTime != null )
        {
            final double diffReq = reqCount - lastReqCount;
            final double timeMillis = Duration.between( lastMeasureTime, now ).toMillis();
            reqSec = ( diffReq / timeMillis ) * 1000;
            reqSec = reqSec < 0 ? 0 : reqSec;
        }
        lastReqCount = reqCount;
        lastMeasureTime = now;

        final MetricsMapper mem =
            new MetricsMapper( now, bean, memoryPools, getProcessCpuLoad(), totalThreadCount, httpThreadCount, reqSec );

        this.onData.accept( mem );

        lastReqCount++; // increase to count the current WS message sent
    }

    private double getProcessCpuLoad()
    {
        final OperatingSystemMXBean bean = ManagementFactory.getOperatingSystemMXBean();
        return bean.getSystemLoadAverage();
    }

}
