# Local Web Server for Epicurus UI

This simple Node.js server allows you to run the Epicurus UI locally without internet connection.

## Setup

1. Make sure you have Node.js installed on your system
2. Navigate to this directory in your terminal
3. Run the following command:

```
node local.js
```

## Features

- Serves all static files from the project root directory
- Provides mock machine status data at `/machine/status`
- Handles G-code commands at `/machine/code`
- Includes CORS headers for cross-origin requests
- Runs on port 8080 by default

## Accessing the UI

Once the server is running, open your browser and navigate to:

```
http://localhost:8080
```

## Troubleshooting

If you're having issues with the server:

1. Make sure no other service is using port 8080
2. Check the console output for any error messages
3. Ensure all required files exist in the project directory 