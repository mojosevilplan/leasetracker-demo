# Lightsail setup (Ubuntu 24.04)

Server IP: 13.63.166.237. Never commit the API key or Smartcar secret; this repo is public.

## 0. In the Lightsail console
- Networking tab of the instance: add firewall rules for **HTTP (80)** and **HTTPS (443)**. Keep SSH (22).
- Create and **attach a static IP** so the address survives a stop/start.

## 1. Hostname for HTTPS
Use your own domain (A record -> the static IP), or for testing the free name
`<ip-with-dashes>.sslip.io`, e.g. `13-63-166-237.sslip.io`, which resolves to that IP.
Use the static IP if it differs from the one above.

## 2. Log in (browser SSH button in Lightsail is easiest) and install
```bash
sudo apt-get update && sudo apt-get install -y curl caddy
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo useradd --system --no-create-home leasetracker
sudo mkdir -p /opt/leasetracker
```

## 3. Put the code on the server
Copy `server.mjs` to `/opt/leasetracker/` and `leasetracker.service` to `/etc/systemd/system/`
(for example `git clone` this repo into your home folder, then `sudo cp`).

## 4. Secrets file (type values yourself)
```bash
sudo nano /etc/leasetracker.env
```
```
SMARTCAR_APPLICATION_ID=a9579813-bb54-4ca3-b269-546b305d269e
SMARTCAR_CLIENT_SECRET=<paste from Smartcar dashboard>
APP_API_KEY=<long random string, e.g. output of: openssl rand -hex 24>
```
```bash
sudo chown root:leasetracker /etc/leasetracker.env && sudo chmod 640 /etc/leasetracker.env
```

## 5. HTTPS with Caddy (it fetches certificates by itself)
```bash
sudo tee /etc/caddy/Caddyfile <<'CADDY'
13-63-166-237.sslip.io {
    reverse_proxy 127.0.0.1:3000
}
CADDY
sudo systemctl restart caddy
```

## 6. Start and test
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now leasetracker
sudo systemctl status leasetracker
curl -i https://13-63-166-237.sslip.io/api/audi/odometer -H "x-api-key: <your key>"
```
Expected before connecting Audi: HTTP 409 `{"error":"not connected"}`. A 401 means a wrong key.

## Housekeeping
- Enable automatic security updates: `sudo apt-get install -y unattended-upgrades`.
- Keep the Lightsail SSH key private; never share it in chat or git.
