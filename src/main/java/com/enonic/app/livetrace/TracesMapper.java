package com.enonic.app.livetrace;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

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
        long maxDuration = 0;
        for ( Trace trace : traces )
        {
            final long d = trace.getDuration().toMillis();
            maxDuration = d > maxDuration ? d : maxDuration;
            if ( trace.getParentId() != null )
            {
                traceChildren.put( trace.getParentId(), trace );
            }
        }

        gen.array( "traces" );
        for ( Trace trace : traces )
        {
            if ( trace.getParentId() == null || trace.getName().equals( "trace.run" ) )
            {
                processChildren( traceChildren, gen, trace );
            }
        }
        gen.end();
        gen.value( "maxDuration", maxDuration );
    }

    private void processChildren( final ListMultimap<String, Trace> traceChildren, final MapGenerator gen, final Trace trace )
    {
        gen.map();

        new TraceMapper( trace ).serialize( gen );

        if ( traceChildren.containsKey( trace.getId() ) )
        {
            gen.array( "children" );
            final List<Trace> children = traceChildren.get( trace.getId() ).
                stream().
                sorted( Comparator.comparing( Trace::getStartTime ) ).
                collect( Collectors.toList() );

            for ( Trace child : children )
            {
                processChildren( traceChildren, gen, child );
            }
            gen.end();
        }

        gen.end();
    }

}
