package com.enonic.app.livetrace;

import java.util.Map;

import com.enonic.xp.script.serializer.MapGenerator;
import com.enonic.xp.script.serializer.MapSerializable;
import com.enonic.xp.trace.Trace;

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
            gen.value( key, values.get( key ) );
        }
    }
}
