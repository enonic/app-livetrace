package com.enonic.app.livetrace;

import java.util.function.Supplier;

import com.enonic.xp.script.bean.BeanContext;
import com.enonic.xp.script.bean.ScriptBean;

public class SamplingHandler
    implements ScriptBean
{
    private Supplier<TraceHandler> traceHandlerSupplier;

    public String startSampling()
    {
        final TraceCollector collector = new TraceCollector();
        final TraceHandler traceHandler = traceHandlerSupplier.get();
        traceHandler.register( collector );
        return collector.getId();
    }

    public TracesMapper stopSampling( final String id )
    {
        final TraceHandler traceHandler = traceHandlerSupplier.get();
        final TraceCollector collector = traceHandler.unregister( id );
        return new TracesMapper( collector.getTraces() );
    }

    @Override
    public void initialize( final BeanContext context )
    {
        traceHandlerSupplier = context.getService( TraceHandler.class );
    }

}
