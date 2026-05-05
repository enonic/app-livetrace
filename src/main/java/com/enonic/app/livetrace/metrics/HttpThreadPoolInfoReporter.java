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

@Component(immediate = true, service = {HttpThreadPoolInfoReporter.class})
public class HttpThreadPoolInfoReporter
{
    private StatusReporter jsonReporter;

    public HttpThreadPoolInfoReporter()
    {
    }

    @Reference(cardinality = ReferenceCardinality.MULTIPLE)
    public void addReporter( final StatusReporter reporter )
    {
        if ( "http.threadpool".equals( reporter.getName() ) )
        {
            this.jsonReporter = reporter;
        }
    }

    public int getThreadCount()
    {
        if ( jsonReporter == null )
        {
            return 0;
        }
        try
        {
            final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            jsonReporter.report( outputStream );
            final JsonNode json = new ObjectMapper().reader().readTree( outputStream.toByteArray() );
            final JsonNode threads = json.get( "threads" );
            return threads != null ? threads.asInt() : 0;
        }
        catch ( IOException e )
        {
            throw new UncheckedIOException( e );
        }
    }
}
