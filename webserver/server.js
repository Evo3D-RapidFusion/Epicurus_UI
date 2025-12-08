const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DUET_IP = process.env.DUET_IP || '10.10.10.100';
const DUET_EXPANSION_IP = process.env.DUET_EXPANSION_IP || '10.10.10.101';
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain'
};

// Proxy function to forward requests to Duet board
function proxyToDuet(req, res, targetIP) {
  const options = {
    hostname: targetIP,
    port: 80,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetIP
    }
  };

  // Remove host header to avoid issues
  delete options.headers.host;

  const proxyReq = http.request(options, (proxyRes) => {
    // Set CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    
    // Copy content-type from response if present
    if (proxyRes.headers['content-type']) {
      headers['Content-Type'] = proxyRes.headers['content-type'];
    }
    
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error(`Proxy error to ${targetIP}: ${error.message}`);
    res.writeHead(502, { 
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(`Bad Gateway: Unable to connect to Duet board at ${targetIP}`);
  });

  // Forward request body for POST requests
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }
  
  // Proxy requests to Duet board (main controller)
  if (req.url.startsWith('/rr_model') || req.url.startsWith('/rr_gcode') || req.url.startsWith('/rr_connect')) {
    proxyToDuet(req, res, DUET_IP);
    return;
  }
  
  // Proxy requests to expansion controller
  if (req.url.startsWith('/expansion/rr_model') || req.url.startsWith('/expansion/rr_gcode') || req.url.startsWith('/expansion/rr_connect')) {
    const expansionUrl = req.url.replace('/expansion', '');
    const modifiedReq = Object.create(req);
    modifiedReq.url = expansionUrl;
    proxyToDuet(modifiedReq, res, DUET_EXPANSION_IP);
    return;
  }
  
  // Settings API endpoints - handle with or without query strings for tunneling compatibility
  const urlPath = req.url.split('?')[0]; // Remove query string if present
  if (urlPath === '/api/settings') {
    const settingsPath = path.join(__dirname, '..', 'settings.json');
    
    if (req.method === 'GET') {
      // Read settings from file
      fs.readFile(settingsPath, 'utf8', (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            // File doesn't exist, return empty object
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({}));
          } else {
            console.error(`Error reading settings: ${err.message}`);
            res.writeHead(500, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ error: 'Failed to read settings' }));
          }
        } else {
          try {
            const settings = JSON.parse(data);
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(settings));
          } catch (parseError) {
            console.error(`Error parsing settings: ${parseError.message}`);
            res.writeHead(500, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ error: 'Failed to parse settings' }));
          }
        }
      });
      return;
    } else if (req.method === 'POST') {
      // Write settings to file
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const settings = JSON.parse(body);
          fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8', (err) => {
            if (err) {
              console.error(`Error writing settings: ${err.message}`);
              res.writeHead(500, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify({ error: 'Failed to save settings' }));
            } else {
              console.log(`Settings saved to ${settingsPath}`);
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              });
              res.end(JSON.stringify({ success: true }));
            }
          });
        } catch (parseError) {
          console.error(`Error parsing request body: ${parseError.message}`);
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        }
      });
      return;
    }
  }
  
  // Normalize file path, making paths like /fonts/roboto.css point to ../fonts/roboto.css
  let filePath = req.url;
  
  // Remove query strings
  filePath = filePath.split('?')[0];
  
  // Handle root path
  if (filePath === '/') {
    filePath = '/index.html';
  }
  
  // Special handling for certain paths
  if (filePath.startsWith('/machine/')) {
    if (filePath === '/machine/status') {
      // Serve mock machine status data
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const mockData = {
        heat: {
          heaters: [
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' },
            { current: 25, active: 0, standby: 0, state: 'off' }
          ],
          bedHeaters: [0, 1, 2, 3],
          chamberHeaters: []
        },
        spindles: [{ current: 0, active: 0, state: 'off' }],
        fans: [
          { rpm: 0 }, { rpm: 0 }, { rpm: 0 }, { rpm: 0 }, 
          { rpm: 0 }, { rpm: 0 }, { rpm: 0 }
        ],
        global: {
          EstopFault: false,
          ExtruderFault: false,
          CNCFault: false,
          toolState: 'PE320',
          materialSensorLEFT: 'Empty',
          materialSensorRIGHT: 'Empty'
        },
        sbc: {
          uptime: 3600,
          dsf: { version: 'v3.4.0' }
        }
      };
      res.end(JSON.stringify(mockData));
      return;
    } else if (filePath === '/machine/code') {
      // Handle G-code POST requests
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          console.log(`Received G-code: ${body}`);
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('G-code executed');
        });
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
      }
      return;
    }
  }
  
  // Get the parent directory to look for files (because we're in the webserver subdirectory)
  const parentDir = path.join(__dirname, '..');
  const absolutePath = path.join(parentDir, filePath.substring(1));
  
  // Get the file extension
  const extname = path.extname(absolutePath).toLowerCase();
  
  // Default to text/plain if content type not found
  const contentType = CONTENT_TYPES[extname] || 'text/plain';
  
  // Read the file
  fs.readFile(absolutePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.error(`File not found: ${absolutePath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        console.error(`Server error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    
    // Add CORS headers to all responses
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Serving files from ${path.join(__dirname, '..')}`);
}); 