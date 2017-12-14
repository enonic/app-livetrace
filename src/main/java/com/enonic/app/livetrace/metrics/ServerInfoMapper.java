package com.enonic.app.livetrace.metrics;

import java.lang.management.ManagementFactory;
import java.lang.management.RuntimeMXBean;

import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;
import com.enonic.xp.server.ServerInfo;
import com.enonic.xp.server.VersionInfo;

public class ServerInfoMapper
    implements MapSerializable
{
    private final ServerInfo serverInfo;

    private final ClusterInfo clusterInfo;

    public ServerInfoMapper( final ServerInfo serverInfo, final ClusterInfo clusterInfo )
    {
        this.serverInfo = serverInfo;
        this.clusterInfo = clusterInfo;
    }

    @Override
    public void serialize( final MapGenerator gen )
    {
        final RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();

        gen.map( "node" );
        gen.value( "nodeName", serverInfo.getName() );
        gen.value( "nodeIsMaster", clusterInfo.isMaster );
        gen.value( "nodeXpVersion", VersionInfo.get().getVersion() );
        gen.value( "nodeJvm", runtimeMXBean.getVmVendor() );
        gen.value( "nodeJvmVersion", runtimeMXBean.getVmVersion() );
        gen.value( "nodeUptime", runtimeMXBean.getUptime() );
        gen.end();

        gen.map( "cluster" );
        gen.value( "clusterName", clusterInfo.name );
        gen.value( "clusterState", clusterInfo.memberCount );
        gen.value( "clusterNodes", clusterInfo.state );
        gen.end();
    }

}
