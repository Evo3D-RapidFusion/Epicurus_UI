# Epicurus UI

A user interface for the Epicurus Controller that works entirely offline.

## Setup for Offline Use

This project has been modified to run completely offline with all resources served locally.

### Apache Setup (Recommended)

If you're using Apache to host these files:

1. Make sure your Apache server has the following modules enabled:
   - mod_rewrite
   - mod_headers

2. Place all files in your Apache document root or a subdirectory
  
3. The included `.htaccess` file will:
   - Route `/machine/status` requests to a static JSON file
   - Handle `/machine/code` POST requests via a PHP script
   - Set necessary CORS headers

4. Open your browser and navigate to:
   ```
   http://localhost/path-to-epicurus-ui/
   ```

### Node.js Setup (Alternative)

If you prefer to use Node.js instead of Apache:

1. Install Node.js on your system

2. Start the local web server:
   ```
   cd webserver
   node local.js
   ```

   Or use npm:
   ```
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

### Main Features

- All resources load from localhost (no internet required)
- Local font files replace Google Fonts
- Mock machine status data available through the local server
- Version information served locally

### Folder Structure

- `/fonts` - Contains local font files
- `/images` - Contains all image assets
- `/jquery` - Contains jQuery library
- `/keyboard` - Contains keyboard plugin files
- `/mock-endpoints` - Contains mock data for API endpoints
- `/webserver` - Contains the Node.js server (alternative to Apache)

## Development

To make changes to the project:

1. Modify HTML, CSS, or JavaScript files as needed
2. Restart the local server if changes are made to local.js
3. Refresh your browser to see the changes

## Testing

For deployment testing procedures, see the **[Deployment Testing Checklist](testing_docs/DEPLOYMENT_TESTING_CHECKLIST.md)**.

The checklist covers:
- UI deployment and update procedures
- Tab functionality testing (Extruder, Bed, Material Profiles, Spindle, Settings)
- Emergency stop and safety features
- Network connectivity and offline operation
- UI/UX elements and performance validation

## Troubleshooting

If you encounter issues:

1. Check if your web server is running properly
2. For Apache: ensure mod_rewrite and mod_headers are enabled
3. For Node.js: ensure no other services are using port 8080
4. Check that all required files are present in their respective directories
5. Examine your browser's developer tools console for any errors 