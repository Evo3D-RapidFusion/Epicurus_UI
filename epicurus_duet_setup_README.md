# README — Epicurus_UI + Duet behind Raspberry Pi (LAN1/LAN2)

This setup makes the Raspberry Pi the single front-door for both Epicurus_UI and the Duet WebUI on **port 80**, from either LAN.

---

## Network

- **RPi**
  - `wlan0` (LAN1 / Wi-Fi): DHCP, e.g. `192.168.1.x`
  - `eth0` (LAN2): `10.10.10.2/24`
- **Duet (LAN2)**
  - `10.10.10.100` (WebUI on port 80)

Goals:
1) Typing the Pi LAN1 IP (e.g. `http://192.168.1.47`) opens Epicurus_UI by default.
2) `http://<Pi>/duet/` opens Duet UI.
3) Epicurus_UI calls Duet via `/duet/...` (never directly to `10.10.10.100`).
4) Works for users on **LAN1 and LAN2**.
5) Persistent across reboots.

---

## Components Overview

### 1) iptables tunnel (Pi)
Purpose: allow LAN1 ↔ LAN2 routing + NAT so Pi can proxy to Duet.

File: `/usr/local/sbin/duet-tunnel.sh`

```bash
#!/bin/bash
# Keep LAN1<->LAN2 routing + NAT so nginx can proxy to Duet. No DNAT on port 80.

set -e

sysctl -w net.ipv4.ip_forward=1 >/dev/null

iptables -t nat -F
iptables -F
iptables -P FORWARD ACCEPT

iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT
iptables -A FORWARD -i eth0 -o wlan0 -m state --state ESTABLISHED,RELATED -j ACCEPT

iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

Make executable:
```bash
sudo chmod +x /usr/local/sbin/duet-tunnel.sh
```

#### Auto-start on boot
Systemd unit: `/etc/systemd/system/duet-tunnel.service`

```ini
[Unit]
Description=Duet tunnel iptables rules
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/duet-tunnel.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable duet-tunnel.service
sudo systemctl start duet-tunnel.service
```

---

### 2) nginx reverse proxy (Pi, port 80)
Purpose:
- Default `/` → Epicurus_UI
- `/Epicurus_UI/` → Apache (Epicurus) on 8080
- `/duet/` → Duet UI on LAN2
- Rewrite Duet’s absolute asset paths so it works under `/duet/`

Site: `/etc/nginx/sites-available/epicurus`

```nginx
server {
    listen 80;
    server_name _;

    # Default landing page → Epicurus UI
    location = / {
        return 301 /Epicurus_UI/;
    }

    # Epicurus UI (served by Apache on 8080)
    location /Epicurus_UI/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Duet UI under /duet/
    location /duet/ {
        proxy_pass http://10.10.10.100:80/;

        # Rewrite absolute paths in Duet HTML/CSS/JS to /duet/*
        sub_filter_types text/html text/css application/javascript;
        sub_filter_once off;
        sub_filter 'href="/'   'href="/duet/';
        sub_filter 'src="/'    'src="/duet/';
        sub_filter 'action="/' 'action="/duet/';
        sub_filter 'url(/'     'url(/duet/';
        proxy_set_header Accept-Encoding "";
    }

    location = /Epicurus_UI { return 301 /Epicurus_UI/; }
    location = /duet       { return 301 /duet/; }
}
```

Enable + reload:
```bash
sudo ln -s /etc/nginx/sites-available/epicurus /etc/nginx/sites-enabled/epicurus
sudo rm -f /etc/nginx/sites-enabled/default   # remove default site conflict
sudo nginx -t
sudo systemctl reload nginx
```

---

### 3) Apache (Pi, Epicurus_UI backend on 8080)
Purpose:
- Host Epicurus_UI at `/` locally on port 8080
- Proxy `/duet/` on 8080 → nginx `/duet/` so Epicurus works when accessed via `localhost:8080`

Enable required modules:
```bash
sudo a2enmod rewrite headers proxy proxy_http
sudo systemctl reload apache2
```

Vhost: `/etc/apache2/sites-available/000-default.conf`

```apache
<VirtualHost *:8080>
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/html/Epicurus_UI

    <Directory /var/www/html/Epicurus_UI>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Make /duet work even when accessing Epicurus via localhost:8080
    ProxyPreserveHost On
    ProxyPass        /duet/  http://127.0.0.1/duet/
    ProxyPassReverse /duet/  http://127.0.0.1/duet/

    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
```

Reload:
```bash
sudo apachectl -t
sudo systemctl reload apache2
```

---

## Epicurus_UI code change

Epicurus must **never call `10.10.10.100` directly**.

Replace Duet base URL with **relative** `/duet`:

Example:
```js
const DUET_BASE = "/duet";
fetch(`${DUET_BASE}/rr_connect`);
```

This makes all Duet calls go:
Epicurus → Pi nginx `/duet/...` → Duet.

---

## How to use

### From LAN1 (Wi-Fi)
- Epicurus default:
  ```
  http://<Pi LAN1 IP>/
  ```
  e.g. `http://192.168.1.47/` → redirects to `/Epicurus_UI/`

- Duet:
  ```
  http://<Pi LAN1 IP>/duet/
  ```

### From LAN2
Use Pi LAN2 IP (`10.10.10.2`) as the host:
- Epicurus:
  ```
  http://10.10.10.2/
  ```
- Duet:
  ```
  http://10.10.10.2/duet/
  ```

**Note:** `http://10.10.10.100/duet/` will NOT work; `/duet` is a Pi path.

---

## Quick health checks

On Pi:
```bash
# Epicurus locally
curl -I http://127.0.0.1:8080/

# Duet locally via nginx
curl -I http://127.0.0.1/duet/

# iptables forwarding counters
sudo iptables -L FORWARD -v -n
sudo iptables -t nat -L POSTROUTING -v -n
```

---

## What persists across reboot

- iptables rules via `duet-tunnel.service`
- nginx + Apache services standard systemd
- sysctl forwarding in `/etc/sysctl.d/99-duet-tunnel.conf`

---

That’s the full final working stack.
