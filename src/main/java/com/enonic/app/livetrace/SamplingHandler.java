package com.enonic.app.livetrace;

import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

import com.enonic.lib.license.LicenseDetails;
import com.enonic.lib.license.LicenseManager;
import com.enonic.xp.app.ApplicationKey;
import com.enonic.xp.script.bean.BeanContext;
import com.enonic.xp.script.bean.ScriptBean;
import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;
import com.enonic.xp.trace.TraceManager;
import com.enonic.xp.trace.Tracer;

public class SamplingHandler
    implements ScriptBean
{
    private Supplier<TraceHandler> traceHandlerSupplier;

    private Supplier<TraceManager> traceManagerSupplier;

    private Supplier<LicenseManager> licenseManagerSupplier;

    public String startSampling( final Consumer<Object> onSample )
    {
        if ( !isValidLicense() )
        {
            return null;
        }
        final TraceManager traceManager = traceManagerSupplier.get();
        if ( !isEnabled() )
        {
            traceManager.enable( true );
        }
        final TraceCollector collector = new TraceCollector( traceManager );
        collector.setOnTrace( onSample );
        final TraceHandler traceHandler = traceHandlerSupplier.get();
        traceHandler.register( collector );
        return collector.getId();
    }

    public void stopSampling( final String id )
    {
        final TraceHandler traceHandler = traceHandlerSupplier.get();
        final TraceCollector collector = traceHandler.unregister( id );
        if ( collector != null )
        {
            collector.shutdown();
        }
        traceManagerSupplier.get().enable( false );
    }

    public int getRequestsPerSecond()
    {
        final TraceHandler traceHandler = traceHandlerSupplier.get();
        return traceHandler.getRequestsPerSecond();
    }

    public MapSerializable getSamplingRequestCount()
    {
        final TraceHandler traceHandler = traceHandlerSupplier.get();
        final Map<String, Integer> values = traceHandler.getSamplingRequestCount();
        return ( MapGenerator mapGenerator ) -> values.forEach( mapGenerator::value );
    }

    public boolean isEnabled()
    {
        return Tracer.isEnabled();
    }

    private boolean isValidLicense()
    {
        final LicenseManager licenseManager = licenseManagerSupplier.get();
        final LicenseDetails licenseDetails = licenseManager.validateLicense( ApplicationKey.from( SamplingHandler.class ).toString() );
        return licenseDetails != null && !licenseDetails.isExpired();
    }

    @Override
    public void initialize( final BeanContext context )
    {
        traceHandlerSupplier = context.getService( TraceHandler.class );
        traceManagerSupplier = context.getService( TraceManager.class );
        licenseManagerSupplier = context.getService( LicenseManager.class );
    }
}
