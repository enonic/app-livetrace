package com.enonic.app.livetrace;

import java.util.Collection;

import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.ListMultimap;

import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;
import com.enonic.xp.trace.Trace;

public final class TracesMapper
    implements MapSerializable
{
    private final Collection<Trace> traces;

    public TracesMapper( final Collection<Trace> traces )
    {
        this.traces = traces;
    }

    @Override
    public void serialize( final MapGenerator gen )
    {
        final ListMultimap<String, Trace> traceChildren = ArrayListMultimap.create();
        for ( Trace trace : traces )
        {
            if ( trace.getParentId() != null )
            {
                traceChildren.put( trace.getParentId(), trace );
            }
        }

        gen.array( "traces" );
        for ( Trace trace : traces )
        {
            if ( trace.getParentId() == null )
            {
                processChildren( traceChildren, gen, trace );
            }
        }
        gen.end();
    }

    private void processChildren( final ListMultimap<String, Trace> traceChildren, final MapGenerator gen, final Trace trace )
    {
        gen.map();

        new TraceMapper( trace ).serialize( gen );

        gen.array( "children" );
        if ( traceChildren.containsKey( trace.getId() ) )
        {
            for ( Trace child : traceChildren.get( trace.getId() ) )
            {
                processChildren( traceChildren, gen, child );
            }
        }
        gen.end();

        gen.end();
    }

}
