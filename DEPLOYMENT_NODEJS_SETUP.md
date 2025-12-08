# Node.js API Server Setup for Raspberry Pi

This guide explains how to set up the Node.js API server to handle `/api/settings` requests when using Apache as the main web server.

## Prerequisites

- Raspberry Pi running Raspbian/Debian
- Apache web server already configured
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

## Step 2: Enable Apache Proxy Modules

```bash
# Enable required Apache modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod rewrite
sudo a2enmod headers

# Restart Apache
sudo systemctl restart apache2
```

## Step 3: Configure Apache Virtual Host

Edit your Apache virtual host configuration (usually `/etc/apache2/sites-available/000-default.conf` or your site config):

```apache
<VirtualHost *:8080>
    # ... existing configuration ...
    
    # Ensure .htaccess is allowed
    <Directory /var/www/html/Epicurus_UI>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

Then restart Apache:
```bash
sudo systemctl restart apache2
```

## Step 4: Create Systemd Service for Node.js Server

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

## Step 6: Verify Setup

1. **Check Node.js server is running:**
   ```bash
   curl http://localhost:3000/api/settings
   ```
   Should return `{}` or your settings JSON.

2. **Check Apache proxy:**
   ```bash
   curl http://localhost:8080/api/settings
   ```
   Should return the same result (proxied through Apache).

3. **Test from browser:**
   Open `http://localhost:8080/api/settings` in your browser - should return JSON.

## Troubleshooting

### Node.js server won't start
- Check logs: `sudo journalctl -u epicurus-api -n 50`
- Verify Node.js is installed: `node --version`
- Check port 3000 is available: `sudo netstat -tulpn | grep 3000`

### Apache proxy not working
- Verify modules are enabled: `apache2ctl -M | grep proxy`
- Check Apache error log: `sudo tail -f /var/log/apache2/error.log`
- Verify `.htaccess` is being read (check Apache config has `AllowOverride All`)

### Permission issues
- Ensure `settings.json` file is writable by www-data:
  ```bash
  sudo touch /var/www/html/Epicurus_UI/settings.json
  sudo chown www-data:www-data /var/www/html/Epicurus_UI/settings.json
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
