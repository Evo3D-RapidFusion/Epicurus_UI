# Node.js API Server Setup for Raspberry Pi

This guide explains how to set up the Node.js API server to handle `/api/settings` requests when using Nginx and Apache as web servers.

## Prerequisites

- Raspberry Pi running Raspbian/Debian
- Nginx configured and listening on port 80
- Apache web server configured and listening on port 8080
- Root/sudo access

## Step 1: Install Node.js

```bash
# Update package list
sudo apt-get update

# Install Node.js (using NodeSource repository for latest LTS version)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

## Step 2: Configure Nginx (Port 80 - Remote Access)

Since Nginx is handling port 80 requests, you need to add a proxy rule for `/api/settings` in your Nginx configuration.

Edit your Nginx configuration file (usually `/etc/nginx/sites-available/default` or your site config):

```bash
sudo nano /etc/nginx/sites-available/default
```

Add the `/api/settings` location block **before** the `/Epicurus_UI/` location block:

```nginx
server {
    listen 80;
    server_name _;

    # Proxy /api/settings requests to Node.js server
    location /api/settings {
        proxy_pass http://127.0.0.1:3000/api/settings;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # default: hitting bare IP goes to Epicurus UI
    location = / {
        return 301 /Epicurus_UI/;
    }

    # Epicurus UI on Pi (your app on localhost:8080)
    location /Epicurus_UI/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # ... rest of your configuration ...
}
```

**Important:** The `/api/settings` location block must come **before** the `/Epicurus_UI/` block, otherwise nginx will try to proxy API requests to Apache.

Test the configuration and restart Nginx:

```bash
# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## Step 3: Enable Apache Proxy Modules

```bash
# Enable required Apache modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod rewrite
sudo a2enmod headers

# Restart Apache
sudo systemctl restart apache2
```

## Step 4: Configure Apache Virtual Host (Port 8080 - Local Access)

Edit your Apache virtual host configuration. You need to add the proxy configuration to **both** port 80 and port 8080 virtual hosts (or whichever ports you're using).

**For port 8080** (usually `/etc/apache2/sites-available/000-default.conf` or your site config):

```apache
<VirtualHost *:8080>
    # ... existing configuration ...
    
    # Ensure .htaccess is allowed
    <Directory /var/www/html/Epicurus_UI>
        AllowOverride All
        Require all granted
    </Directory>
    
    # Proxy /api/settings requests to Node.js server
    ProxyPreserveHost On
    ProxyPass /api/settings http://localhost:3000/api/settings
    ProxyPassReverse /api/settings http://localhost:3000/api/settings
</VirtualHost>
```

**For port 80** (if accessing remotely without specifying port, add to port 80 virtual host as well):

```apache
<VirtualHost *:80>
    # ... existing configuration ...
    
    # Ensure .htaccess is allowed
    <Directory /var/www/html/Epicurus_UI>
        AllowOverride All
        Require all granted
    </Directory>
    
    # Proxy /api/settings requests to Node.js server
    ProxyPreserveHost On
    ProxyPass /api/settings http://localhost:3000/api/settings
    ProxyPassReverse /api/settings http://localhost:3000/api/settings
</VirtualHost>
```

**Important:** 
- The proxy configuration in the virtual host takes precedence over `.htaccess`
- This configuration is for local access via port 8080
- Remote access via port 80 is handled by Nginx (Step 2)

Then restart Apache:
```bash
sudo systemctl restart apache2
```

## Step 5: Create Systemd Service for Node.js Server

Create a systemd service file to run the Node.js server automatically:

```bash
sudo nano /etc/systemd/system/epicurus-api.service
```

Add the following content:

```ini
[Unit]
Description=Epicurus UI API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/html/Epicurus_UI
Environment="PORT=3000"
Environment="DUET_IP=10.10.10.100"
Environment="DUET_EXPANSION_IP=10.10.10.101"
ExecStart=/usr/bin/node webserver/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## Step 5: Start and Enable the Service

```bash
# Reload systemd daemon
sudo systemctl daemon-reload

# Start the service
sudo systemctl start epicurus-api

# Enable service to start on boot
sudo systemctl enable epicurus-api

# Check service status
sudo systemctl status epicurus-api

# View logs
sudo journalctl -u epicurus-api -f
```

## Step 7: Verify Setup

1. **Check Node.js server is running:**
   ```bash
   curl http://localhost:3000/api/settings
   ```
   Should return `{}` or your settings JSON.

2. **Check Nginx proxy (port 80 - remote access):**
   ```bash
   curl http://localhost/api/settings
   ```
   Should return the same result (proxied through Nginx).

3. **Check Apache proxy (port 8080 - local access):**
   ```bash
   curl http://localhost:8080/api/settings
   ```
   Should return the same result (proxied through Apache).

4. **Test from browser (remote):**
   Open `http://192.168.1.47/api/settings` in your browser - should return JSON.

5. **Test from browser (local):**
   Open `http://localhost:8080/api/settings` in your browser - should return JSON.

## Troubleshooting

### Node.js server won't start
- Check logs: `sudo journalctl -u epicurus-api -n 50`
- Verify Node.js is installed: `node --version`
- Check port 3000 is available: `sudo netstat -tulpn | grep 3000`

### Nginx proxy not working (port 80 - remote access)
- Check Nginx error log: `sudo tail -f /var/log/nginx/error.log`
- Test Nginx configuration: `sudo nginx -t`
- **Important:** The `/api/settings` location block must come **before** `/Epicurus_UI/` in your nginx config
- Verify the proxy is configured in `/etc/nginx/sites-available/default` (or your site config)
- Test the proxy directly: `curl http://localhost/api/settings`
- Test Node.js server directly: `curl http://localhost:3000/api/settings`
- Restart Nginx: `sudo systemctl restart nginx`

### Apache proxy not working (port 8080 - local access)
- Verify modules are enabled: `apache2ctl -M | grep proxy`
- Check Apache error log: `sudo tail -f /var/log/apache2/error.log`
- **Important:** Proxy configuration should be in the Apache virtual host config, not just `.htaccess`
- Verify the proxy is configured in `/etc/apache2/sites-available/000-default.conf` (or your site config)
- Test the proxy directly: `curl http://localhost:8080/api/settings`
- Test Node.js server directly: `curl http://localhost:3000/api/settings`
- List all virtual hosts: `apache2ctl -S` to see which ports are configured

### Permission issues

**For Git operations and Node.js writes to work together:**

```bash
# Add your user to www-data group (replace 'pe320' with your username)
sudo usermod -a -G www-data pe320

# Set directory ownership to your user, but with www-data group
sudo chown -R pe320:www-data /var/www/html/Epicurus_UI

# Set directory permissions (775 = owner and group can read/write/execute)
sudo chmod -R 775 /var/www/html/Epicurus_UI

# Ensure settings.json is writable by group
sudo touch /var/www/html/Epicurus_UI/settings.json
sudo chown pe320:www-data /var/www/html/Epicurus_UI/settings.json
sudo chmod 664 /var/www/html/Epicurus_UI/settings.json

# Log out and back in (or use 'newgrp www-data') for group changes to take effect
newgrp www-data

# Verify you're in the group
groups
```

**Alternative: Use sudo for git operations:**
```bash
# If you prefer to keep www-data ownership, use sudo for git
sudo git pull origin v3.3-standalone
sudo git status
# etc.
```

**Quick fix for immediate git access:**
```bash
# Temporarily change ownership for git operations
sudo chown -R pe320:pe320 /var/www/html/Epicurus_UI
git pull origin v3.3-standalone

# Then fix permissions for Node.js
sudo chown -R pe320:www-data /var/www/html/Epicurus_UI
sudo chmod -R 775 /var/www/html/Epicurus_UI
sudo chmod 664 /var/www/html/Epicurus_UI/settings.json
```

### Port conflicts
- If port 3000 is in use, change it in:
  1. `/etc/systemd/system/epicurus-api.service` (Environment="PORT=3000")
  2. `.htaccess` (change `:3000` to your port)

## Manual Testing

To test the Node.js server manually (without systemd):

```bash
cd /var/www/html/Epicurus_UI
PORT=3000 node webserver/server.js
```

Then test in another terminal:
```bash
curl http://localhost:3000/api/settings
```

Press Ctrl+C to stop the manual server.

## Updating the Service

After making changes to `server.js`:

```bash
sudo systemctl restart epicurus-api
sudo systemctl status epicurus-api
```
