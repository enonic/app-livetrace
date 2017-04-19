package com.enonic.app.livetrace;

import java.util.Collection;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;

import com.enonic.xp.trace.Trace;

public final class TraceCollector
{
    private final String id;

    private final ConcurrentLinkedQueue<Trace> traces;

    private final AtomicInteger requestCount;

    public TraceCollector()
    {
        id = UUID.randomUUID().toString();
        traces = new ConcurrentLinkedQueue<>();
        requestCount = new AtomicInteger( 0 );
    }

    public void add( final Trace trace )
    {
        traces.add( trace );
        if ( trace.getParentId() == null )
        {
            this.requestCount.incrementAndGet();
        }
    }

    public String getId()
    {
        return id;
    }

    public Collection<Trace> getTraces()
    {
        return traces;
    }

    public int size()
    {
        return requestCount.get();
    }
}
