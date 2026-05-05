package com.enonic.app.livetrace.metrics;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

import org.osgi.service.component.annotations.Deactivate;

import com.enonic.xp.index.IndexService;
import com.enonic.xp.script.bean.BeanContext;
import com.enonic.xp.script.bean.ScriptBean;

public class MetricsHandler
    implements ScriptBean
{
    private HttpThreadPoolInfoReporter threadPoolInfoReporter;

    private IndexService indexService;

    private ConcurrentHashMap<String, MetricsEmitter> emitters;

    private ClusterInfoReporter clusterInfoReporter;

    public MetricsHandler()
    {
        emitters = new ConcurrentHashMap<>();
    }

    public MetricsEmitter subscribe( final String sessionId, final Consumer<Object> onData )
    {
        return emitters.computeIfAbsent( sessionId, ( sid ) -> {
            final MetricsEmitter emitter = new MetricsEmitter( sid, threadPoolInfoReporter, clusterInfoReporter, onData );
            emitter.start();
            return emitter;
        } );
    }

    public void unsubscribe( final String sessionId )
    {
        final MetricsEmitter emitter = emitters.get( sessionId );
        if ( emitter != null )
        {
            emitter.stop();
        }
    }

    @Deactivate
    public void deactivate()
    {
        emitters.forEach( ( sid, p ) -> p.stop() );
    }

    @Override
    public void initialize( final BeanContext context )
    {
        this.threadPoolInfoReporter = context.getService( HttpThreadPoolInfoReporter.class ).get();
        this.indexService = context.getService( IndexService.class ).get();
        this.clusterInfoReporter = context.getService( ClusterInfoReporter.class ).get();
    }
}
