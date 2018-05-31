package com.enonic.app.livetrace;

import java.util.List;
import java.util.Map;

import com.enonic.xp.context.Context;
import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;
import com.enonic.xp.trace.Trace;
import com.enonic.xp.web.WebRequest;
import com.enonic.xp.web.WebResponse;

public final class TraceMapper
    implements MapSerializable
{
    private final Trace trace;

    public TraceMapper( final Trace trace )
    {

        this.trace = trace;
    }

    @Override
    public void serialize( final MapGenerator gen )
    {
        gen.value( "id", trace.getId() );
        gen.value( "parent", trace.getParentId() );
        gen.value( "name", trace.getName() );
        gen.value( "start", trace.getStartTime() );
        gen.value( "end", trace.getEndTime() );
        gen.value( "duration", trace.getDuration().toMillis() );
        gen.value( "time", trace.getDuration().toMillis() );
        WebRequest req = (WebRequest) trace.get( "httpRequest" );
        WebResponse res = (WebResponse) trace.get( "httpResponse" );
        Context ctx = (Context) trace.get( "context" );
        gen.map( "data" );
        if ( !trace.isEmpty() )
        {
            serializeCustomFields( gen, trace );
        }
        gen.end();
    }

    private void serializeCustomFields( final MapGenerator gen, final Map<String, Object> values )
    {
        for ( String key : values.keySet() )
        {
            final Object value = values.get( key );
            if ( value instanceof List )
            {
                gen.array( key );
                for ( Object item : (List) value )
                {
                    gen.value( item );
                }
                gen.end();
            }
            else
            {
                gen.value( key, value );
            }
        }
    }
}
