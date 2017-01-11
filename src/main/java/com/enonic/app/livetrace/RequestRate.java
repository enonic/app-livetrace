package com.enonic.app.livetrace;

import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedQueue;

final class RequestRate
{
    private final ConcurrentLinkedQueue<Instant> requests;

    RequestRate( )
    {
        this.requests = new ConcurrentLinkedQueue<>();
    }

    public void addRequest( final Instant t )
    {
        requests.add( t );
        trimEntries( t );
    }

    private void trimEntries( final Instant lastEntry )
    {
        final Instant minT = lastEntry.minusSeconds( 1 );
        requests.removeIf( ( t ) -> t.isBefore( minT ) );
    }

    public int requestsPerSecond()
    {
        trimEntries( Instant.now() );
        return requests.size();
    }
}
