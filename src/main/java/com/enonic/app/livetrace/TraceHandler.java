package com.enonic.app.livetrace;

import java.util.Map;

import org.osgi.service.component.annotations.Component;

import com.enonic.xp.trace.Trace;
import com.enonic.xp.trace.TraceEvent;
import com.enonic.xp.trace.TraceListener;

@Component(immediate = true)
public class TraceHandler
    implements TraceListener
{
    private Map<String, Trace> traces;

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
    }
}
