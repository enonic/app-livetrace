package com.enonic.app.livetrace.metrics;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.component.annotations.ReferenceCardinality;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.enonic.xp.status.StatusReporter;

@Component(immediate = true, service = {ClusterInfoReporter.class})
public class ClusterInfoReporter
{
    private StatusReporter jsonReporter;

    public ClusterInfoReporter()
    {
    }

    @Reference(cardinality = ReferenceCardinality.MULTIPLE)
    public void addReporter( final StatusReporter reporter )
    {
        if ( reporter.getName().equals( "cluster" ) || reporter.getName().equals( "cluster.elasticsearch" ) )
        {
            this.jsonReporter = reporter;
        }
    }

    public ClusterInfo getInfo()
    {
        ClusterInfo info = new ClusterInfo();
        if ( jsonReporter != null )
        {
            final JsonNode json;
            try
            {
                final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                jsonReporter.report( outputStream );
                json = new ObjectMapper().reader().readTree( outputStream.toByteArray() );
            }
            catch ( IOException e )
            {
                throw new UncheckedIOException( e );
            }

            final JsonNode localNode = json.get( "localNode" );
            info.name = json.get( "name" ).asText();
            info.state = json.get( "state" ).asText();
            info.isMaster = localNode.get( "isMaster" ).booleanValue();
            info.id = localNode.get( "id" ).asText();
            info.memberCount = json.get( "members" ).size();
        }
        return info;
    }
}
