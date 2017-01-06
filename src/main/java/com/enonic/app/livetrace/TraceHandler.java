package com.enonic.app.livetrace;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.osgi.service.component.annotations.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.enonic.xp.trace.Trace;
import com.enonic.xp.trace.TraceEvent;
import com.enonic.xp.trace.TraceListener;

@Component(immediate = true, service = {TraceListener.class, TraceHandler.class})
public final class TraceHandler
    implements TraceListener
{
    private final static Logger LOG = LoggerFactory.getLogger( TraceHandler.class );

    private final ConcurrentMap<String, TraceCollector> collectors;

    public TraceHandler()
    {
        collectors = new ConcurrentHashMap<>();
    }

    @Override
    public void onTrace( final TraceEvent event )
    {
        final Trace trace = event.getTrace();
        if ( event.getType() != TraceEvent.Type.END )
        {
            return;
        }
        System.out.println( trace.getName() + " -> " + trace.get( "method" ) + " " + trace.get( "path" ) + " (" +
                                trace.getDuration().toString().substring( 2 ).toLowerCase() + ")" );

        process( trace );
    }

    private void process( final Trace trace )
    {
        for ( TraceCollector collector : collectors.values() )
        {
            collector.add( trace );
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
}
