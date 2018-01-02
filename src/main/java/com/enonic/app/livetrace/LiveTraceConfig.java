package com.enonic.app.livetrace;

public @interface LiveTraceConfig
{
    String maxTracingTime() default "30";
}
