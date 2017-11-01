package com.enonic.app.livetrace;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.ListMultimap;
import com.google.common.collect.Multimaps;

import com.enonic.xp.trace.Trace;

public final class TraceCollector
{
    private final String id;

    private final ListMultimap<String, Trace> traces;

    private final AtomicInteger requestCount;

    private final Instant started;

    private Consumer<Object> onTrace;

    private final ExecutorService scheduler;

    public TraceCollector()
    {
        id = UUID.randomUUID().toString();
        traces = Multimaps.synchronizedListMultimap( ArrayListMultimap.create() );
        requestCount = new AtomicInteger( 0 );
        started = Instant.now();
        scheduler = Executors.newFixedThreadPool( 10 );
    }

    public void shutdown()
    {
        try
        {
            scheduler.shutdown();
        }
        catch ( Exception e )
        {
            // DO NOTHING
        }
        if ( onTrace != null )
        {
            onTrace.accept( "stop" );
        }
    }

    public void add( final Trace trace )
    {
        if ( trace.getParentId() != null )
        {
            traces.put( trace.getParentId(), trace );
        }

        if ( trace.getParentId() == null )
        {
            this.requestCount.incrementAndGet();
        }
        if ( onTrace != null && trace.getParentId() == null )
        {
            scheduler.submit( () -> this.sendTraces( trace ) );
        }
    }

    private void sendTraces( final Trace trace )
    {
        final ArrayList<Trace> traces = new ArrayList<>();
        traces.add( trace );
        collectSubTraces( traces, trace );
        onTrace.accept( new TracesMapper( traces ) );
    }

    private void collectSubTraces( final List<Trace> traceList, final Trace parent )
    {
        final List<Trace> subTraces = traces.removeAll( parent.getId() );
        traceList.addAll( subTraces );
        for ( Trace t : subTraces )
        {
            collectSubTraces( traceList, t );
        }
    }

    public String getId()
    {
        return id;
    }

    public int size()
    {
        return requestCount.get();
    }

    public boolean runningLongerThan( final Duration duration )
    {
        return started.plus( duration ).isBefore( Instant.now() );
    }

    public void setOnTrace( final Consumer<Object> onTrace )
    {
        this.onTrace = onTrace;
    }

}
