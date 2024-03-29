package com.enonic.app.livetrace;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Deactivate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.common.primitives.Longs;

import com.enonic.xp.app.ApplicationKey;
import com.enonic.xp.trace.Trace;
import com.enonic.xp.trace.TraceEvent;
import com.enonic.xp.trace.TraceListener;

@Component(immediate = true, service = {TraceListener.class, TraceHandler.class}, configurationPid = "com.enonic.app.livetrace")
public final class TraceHandler
    implements TraceListener
{
    private final static Logger LOG = LoggerFactory.getLogger( TraceHandler.class );

    private final String liveTraceApp;

    private final String liveTraceAppPrefix;

    private static final Long DEFAULT_MAX_MINUTES = 10L;

    private static final Long DEFAULT_MAX_REQUESTS = 1_000L;

    private final ConcurrentMap<String, TraceCollector> collectors;

    private final RequestRate requestRate;

    private final ScheduledExecutorService scheduler;

    private ScheduledFuture<?> autoStopFuture;

    private Duration maxDuration = Duration.ofMinutes( DEFAULT_MAX_MINUTES );

    public TraceHandler()
    {
        collectors = new ConcurrentHashMap<>();
        requestRate = new RequestRate();
        scheduler = Executors.newScheduledThreadPool( 1 );
        liveTraceApp = ApplicationKey.from( TraceHandler.class ).toString();
        liveTraceAppPrefix = liveTraceApp + ":";
    }

    @Activate
    public void activate( final LiveTraceConfig config )
    {
        Long timeValue = Longs.tryParse( config.maxTracingTime() );
        timeValue = ( timeValue == null || timeValue < 1 ) ? DEFAULT_MAX_MINUTES : timeValue;
        maxDuration = Duration.ofMinutes( timeValue );
        autoStopFuture = scheduler.scheduleAtFixedRate( this::autoStop, 0, 10, TimeUnit.SECONDS );
        LOG.info( "Live Trace maximum tracing time is " + timeValue + " minutes." );
    }

    @Deactivate
    public void deactivate()
        throws Exception
    {
        autoStopFuture.cancel( true );
        for ( TraceCollector collector : collectors.values() )
        {
            collector.shutdown();
        }
    }

    @Override
    public void onTrace( final TraceEvent event )
    {
        final Trace trace = event.getTrace();
        final TraceEvent.Type eventType = event.getType();
        if ( eventType != TraceEvent.Type.END && !trace.getName().equals( "task.run" ) )
        {
            return;
        }
        final String sourceScript = Objects.toString( trace.get( "script" ), null ) ;
        if ( sourceScript != null && sourceScript.startsWith( liveTraceAppPrefix ) )
        {
            return;
        }
        final String sourceApp = Objects.toString( trace.get( "app" ), null );
        if ( sourceApp != null && sourceApp.equals( liveTraceApp ) )
        {
            return;
        }

        if ( "portalRequest".equals( trace.getName() ) )
        {
            requestRate.addRequest( trace.getEndTime() );
        }
        process( trace, eventType );
    }

    private void process( final Trace trace, final TraceEvent.Type eventType )
    {
        if ( collectors.isEmpty() )
        {
            return;
        }

        for ( TraceCollector collector : collectors.values() )
        {
            collector.add( trace, eventType );
        }
    }

    private void autoStop()
    {
        if ( collectors.isEmpty() )
        {
            return;
        }

        try
        {
            collectors.forEach( ( id, collector ) -> {
                if ( collector.runningLongerThan( maxDuration ) )
                {
                    LOG.info(
                        "Stopping event tracing (Sampling ID: " + id + ") running for more than " + maxDuration.toMinutes() + " minutes." );
                    unregister( id );
                    collector.shutdown();
                }
                else if ( collector.size() >= DEFAULT_MAX_REQUESTS )
                {
                    LOG.info(
                        "Stopping event tracing (Sampling ID: " + id + "), more than " + DEFAULT_MAX_REQUESTS + " requests processed." );
                    unregister( id );
                    collector.shutdown();
                }
            } );
        }
        catch ( Throwable t )
        {
            LOG.error( "Exception in event tracing autoStop ", t );
        }
    }

    public void register( final TraceCollector collector )
    {
        collectors.put( collector.getId(), collector );
    }

    public TraceCollector unregister( final String collectorId )
    {
        return collectors.remove( collectorId );
    }

    public int getRequestsPerSecond()
    {
        return requestRate.requestsPerSecond();
    }

    public Map<String, Integer> getSamplingRequestCount()
    {
        final Map<String, Integer> samplingCount = new HashMap<>();
        collectors.forEach( ( id, collector ) -> samplingCount.put( id, collector.size() ) );
        return samplingCount;
    }
}
