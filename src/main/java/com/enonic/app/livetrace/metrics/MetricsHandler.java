package com.enonic.app.livetrace.metrics;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

import org.osgi.service.component.annotations.Deactivate;

import com.enonic.xp.index.IndexService;
import com.enonic.xp.script.bean.BeanContext;
import com.enonic.xp.script.bean.ScriptBean;
import com.enonic.xp.web.thread.ThreadPoolInfo;

public class MetricsHandler
    implements ScriptBean
{
    private ThreadPoolInfo threadPool;

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
            final MetricsEmitter emitter = new MetricsEmitter( sid, threadPool, clusterInfoReporter, onData );
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
        this.threadPool = context.getService( ThreadPoolInfo.class ).get();
        this.indexService = context.getService( IndexService.class ).get();
        this.clusterInfoReporter = context.getService( ClusterInfoReporter.class ).get();
    }
}
