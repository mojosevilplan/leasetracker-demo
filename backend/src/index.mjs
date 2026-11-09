// Minimal Smartcar token-exchange backend. NOT verified against live Smartcar yet:
// the URLs below are the classic v2 endpoints; check Smartcar docs if your app uses v3.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sm = new SecretsManagerClient({});
const { TABLE, SECRET_ARN, SMARTCAR_APPLICATION_ID: APP_ID, APP_API_KEY } = process.env;
const TOKEN_URL = 'https://auth.smartcar.com/oauth/token';
const API = 'https://api.smartcar.com/v2.0';
const json = (s, b) => ({ statusCode: s, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

let cachedSecret;
async function clientSecret() {
  if (!cachedSecret) {
    const r = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
    cachedSecret = JSON.parse(r.SecretString).client_secret;
  }
  return cachedSecret;
}

async function tokenRequest(params) {
  const basic = Buffer.from(`${APP_ID}:${await clientSecret()}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  return res.json();
}

async function saveTokens(t) {
  await db.send(new PutCommand({ TableName: TABLE, Item: {
    id: 'audi', access_token: t.access_token, refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000 } }));
}

async function accessToken() {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { id: 'audi' } }));
  if (!Item) return null;
  if (Date.now() < Item.expires_at) return Item.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: Item.refresh_token });
  await saveTokens(t);
  return t.access_token;
}

export async function handler(event) {
  const path = event.rawPath, method = event.requestContext.http.method;
  if (event.headers['x-api-key'] !== APP_API_KEY) return json(401, { error: 'unauthorized' });
  try {
    // Phone app sends the one-time code it got from Smartcar Connect.
    if (method === 'POST' && path === '/api/audi/exchange') {
      const { code, redirect_uri } = JSON.parse(event.body || '{}');
      if (!code || !redirect_uri) return json(400, { error: 'code and redirect_uri required' });
      await saveTokens(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri }));
      return json(200, { connected: true });
    }
    // Phone app asks for the odometer; the tick-to-confirm stays in the app.
    if (method === 'GET' && path === '/api/audi/odometer') {
      const token = await accessToken();
      if (!token) return json(409, { error: 'not connected' });
      const h = { authorization: `Bearer ${token}` };
      const { vehicles } = await (await fetch(`${API}/vehicles`, { headers: h })).json();
      const o = await (await fetch(`${API}/vehicles/${vehicles[0]}/odometer`, { headers: h })).json();
      return json(200, { km: Math.round(o.distance) });   // v2 returns km unless unit header is set
    }
    return json(404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'upstream failure' });
  }
}
