package com.enonic.app.livetrace.metrics;

import java.io.IOException;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.component.annotations.ReferenceCardinality;

import com.fasterxml.jackson.databind.JsonNode;

import com.enonic.xp.status.JsonStatusReporter;
import com.enonic.xp.status.StatusReporter;

@Component(immediate = true, service = {ClusterInfoReporter.class})
public class ClusterInfoReporter
{
    private JsonStatusReporter jsonReporter;

    public ClusterInfoReporter()
    {
    }

    @Reference(cardinality = ReferenceCardinality.MULTIPLE)
    public void addReporter( final StatusReporter reporter )
        throws IOException
    {
        if ( reporter.getName().equals( "cluster" ) )
        {
            this.jsonReporter = (JsonStatusReporter) reporter;
        }
    }

    public ClusterInfo getInfo()
    {
        ClusterInfo info = new ClusterInfo();
        final JsonNode json = jsonReporter.getReport();
        final JsonNode localNode = json.get( "localNode" );
        info.name = json.get( "name" ).asText();
        info.state = json.get( "state" ).asText();
        info.isMaster = localNode.get( "isMaster" ).booleanValue();
        info.id = localNode.get( "id" ).asText();
        info.memberCount = json.get( "members" ).size();
        return info;
    }
}
