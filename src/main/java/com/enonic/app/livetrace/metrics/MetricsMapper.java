package com.enonic.app.livetrace.metrics;

import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryUsage;
import java.time.Instant;
import java.util.List;

import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;

public class MetricsMapper
    implements MapSerializable
{
    private final Instant time;

    private final MemoryMXBean memBean;

    private final List<MemoryPoolMXBean> memoryPools;

    private final double processCpuLoad;

    private final int totalThreadCount;

    private final int httpThreadCount;

    private final double requestsPerSecond;

    public MetricsMapper( final Instant time, final MemoryMXBean memBean, final List<MemoryPoolMXBean> memoryPools,
                          final double processCpuLoad, final int totalThreadCount, final int httpThreadCount, final double requestsPerSecond )
    {
        this.time = time;
        this.memBean = memBean;
        this.memoryPools = memoryPools;
        this.processCpuLoad = processCpuLoad;
        this.totalThreadCount = totalThreadCount;
        this.httpThreadCount = httpThreadCount;
        this.requestsPerSecond = requestsPerSecond;
    }

    @Override
    public void serialize( final MapGenerator gen )
    {
        gen.map( "data" );
        gen.value( "time", time.getEpochSecond() );

        gen.value( "cpuLoad", processCpuLoad );
        gen.value( "requestRate", requestsPerSecond );

        gen.map( "heap" );
        buildMemoryUsageInfo( gen, memBean.getHeapMemoryUsage() );
        gen.end();

        gen.map( "nonHeap" );
        buildMemoryUsageInfo( gen, memBean.getNonHeapMemoryUsage() );
        gen.end();

        gen.array( "pools" );
        buildMemoryPools( gen );
        gen.end();

        gen.map( "threads" );
        gen.value( "total", totalThreadCount );
        gen.value( "http", httpThreadCount );
        gen.end();

        gen.end();
    }

    private void buildMemoryPools( final MapGenerator gen )
    {
        for ( final MemoryPoolMXBean mp : memoryPools )
        {
            buildPoolInfo( gen, mp );
        }
    }

    private void buildPoolInfo( final MapGenerator gen, final MemoryPoolMXBean pool )
    {
        gen.map();
        gen.value( "name", pool.getName() );
        gen.value( "type", pool.getType().toString() );

        if ( pool.getUsage() != null )
        {
            gen.map( "usage" );
            buildMemoryUsageInfo( gen, pool.getUsage() );
            gen.end();
        }
        gen.end();
    }

    private void buildMemoryUsageInfo( final MapGenerator gen, final MemoryUsage mem )
    {
        gen.value( "init", mem.getInit() );
        gen.value( "max", mem.getMax() );
        gen.value( "committed", mem.getCommitted() );
        gen.value( "used", mem.getUsed() );
    }

}
