# Live Trace application for Enonic XP

<img align="right" alt="Live Trace Logo" width="128" src="./src/main/resources/application.svg">

Live Trace allows *capturing traffic* that is sent to XP to analyze and improve its performance. 

This application requires Enonic XP 6.14.x or higher.

## Building and deploying

Build this application from the command line. Go to the root of the project and enter:

    ./gradlew clean build

To deploy the app, set `$XP_HOME` environment variable and enter:

    ./gradlew deploy


## Documentation

[See documentation here.](https://github.com/enonic/app-livetrace/blob/master/docs/index.adoc)
