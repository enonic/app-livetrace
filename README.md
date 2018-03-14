# Live Trace application for Enonic XP

<img align="right" alt="Live Trace Logo" width="128" src="./src/main/resources/application.svg">

This application listens to trace events and record the events in a searchable index. Can be set up to record maximum number
of trace events. This application requires Enonic XP 6.12.x and greater.

## Building and deploying

Build this application from the command line. Go to the root of the project and enter:

    ./gradlew clean build

To deploy the app, set `$XP_HOME` environment variable and enter:

    ./gradlew deploy


## Documentation

[See documentation here.](https://github.com/enonic/app-livetrace/blob/master/docs/index.adoc)
