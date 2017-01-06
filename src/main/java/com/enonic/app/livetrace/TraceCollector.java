package com.enonic.app.livetrace;

import java.util.Collection;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;

import com.enonic.xp.trace.Trace;

public final class TraceCollector
{
    private final String id;

    private final ConcurrentLinkedQueue<Trace> traces;

    public TraceCollector()
    {
        id = UUID.randomUUID().toString();
        traces = new ConcurrentLinkedQueue<>();
    }

    public void add( final Trace trace )
    {
        traces.add( trace );
    }

    public String getId()
    {
        return id;
    }

    public Collection<Trace> getTraces()
    {
        return traces;
    }
}
