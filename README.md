# Livetrace application for Enonic XP

This application listens to trace events and record the events in a searchable index. Can be set up to record maximum number
of trace events. This application requires Enonic XP 6.12.x and greater.

## Configuration

To configure this application create a file named `com.enonic.app.livetrace` in XP configuration directory. 
The following settings can be specified in the config:

* maxTracingTime: maximum time before tracing is automatically stopped, in minutes. Default is 10. 

Example `com.enonic.app.livetrace` file:
```
# maximum tracing time 5 minutes
maxTracingTime=5
```
