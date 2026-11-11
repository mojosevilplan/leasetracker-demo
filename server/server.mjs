// Plain Node version of the Smartcar token-exchange backend (for Lightsail).
// Needs Node 20+. No dependencies. NOT verified against live Smartcar yet (uses v2 endpoints).
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const {
  SMARTCAR_APPLICATION_ID: APP_ID,
  SMARTCAR_CLIENT_SECRET: SECRET,
  APP_API_KEY,
  TOKEN_FILE = '/var/lib/leasetracker/tokens.json',
  PORT = '3000',
} = process.env;
for (const [k, v] of Object.entries({ APP_ID, SECRET, APP_API_KEY })) {
  if (!v) { console.error(`Missing env var for ${k}`); process.exit(1); }
}
const TOKEN_URL = 'https://auth.smartcar.com/oauth/token';
const API = 'https://api.smartcar.com/v2.0';

async function tokenRequest(params) {
  const basic = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  return res.json();
}
async function saveTokens(t) {
  await mkdir(dirname(TOKEN_FILE), { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify({
    access_token: t.access_token, refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000 }), { mode: 0o600 });
}
async function accessToken() {
  let s;
  try { s = JSON.parse(await readFile(TOKEN_FILE, 'utf8')); } catch { return null; }
  if (Date.now() < s.expires_at) return s.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token });
  await saveTokens(t);
  return t.access_token;
}
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((ok, no) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 10_000) req.destroy(); });
  req.on('end', () => ok(d)); req.on('error', no);
});

http.createServer(async (req, res) => {
  if (req.headers['x-api-key'] !== APP_API_KEY) return send(res, 401, { error: 'unauthorized' });
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (req.method === 'POST' && path === '/api/audi/exchange') {
      const { code, redirect_uri } = JSON.parse((await readBody(req)) || '{}');
      if (!code || !redirect_uri) return send(res, 400, { error: 'code and redirect_uri required' });
      await saveTokens(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri }));
      return send(res, 200, { connected: true });
    }
    if (req.method === 'GET' && path === '/api/audi/odometer') {
      const token = await accessToken();
      if (!token) return send(res, 409, { error: 'not connected' });
      const h = { authorization: `Bearer ${token}` };
      const { vehicles } = await (await fetch(`${API}/vehicles`, { headers: h })).json();
      const o = await (await fetch(`${API}/vehicles/${vehicles[0]}/odometer`, { headers: h })).json();
      return send(res, 200, { km: Math.round(o.distance) });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: 'upstream failure' });
  }
}).listen(Number(PORT), '127.0.0.1', () => console.log(`listening on 127.0.0.1:${PORT}`));
