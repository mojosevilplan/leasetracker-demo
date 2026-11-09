# Leasetracker backend (test setup)

A tiny AWS backend so the Android app can read an Audi odometer through Smartcar
without putting the Smartcar **client secret** inside the app.

## How it works (the 5-minute version)

```
Phone app ──(1) Smartcar Connect sign-in──▶ Smartcar ──▶ gives the app a one-time "code"
Phone app ──(2) POST code ────────────────▶ Lambda ──▶ trades code + secret for tokens ──▶ DynamoDB
Phone app ──(3) GET odometer ─────────────▶ Lambda ──▶ uses stored token ──▶ Smartcar ──▶ km back to app
```

- **Lambda** = a function AWS runs only when called. No server to manage; idle cost is zero.
- **Function URL** = a public HTTPS address for that function. The code checks an `x-api-key` header so strangers can't use it.
- **Secrets Manager** = locked storage for the Smartcar client secret. Only the function can read it.
- **DynamoDB** = a small table that holds the Smartcar access/refresh tokens.
- **SAM template** (`template.yaml`) = a text description of all of the above. `sam deploy` builds it;
  `sam delete` removes everything, so a failed experiment costs nothing.

Why a backend at all? Anything inside an APK can be extracted. The secret must live on a server.

## Deploy (region `eu-north-1`, Stockholm; AWS has no Norway region)

1. Install the AWS CLI and SAM CLI, then run `aws configure` (or SSO login) with your account.
2. Pick a long random key for the app, e.g. `openssl rand -hex 24`.
3. From this folder:
   ```bash
   sam build
   sam deploy --guided --region eu-north-1 --parameter-overrides AppApiKey=<your-random-key>
   ```
   Note the `FunctionUrl` printed at the end.
4. In the AWS console open **Secrets Manager**, find the secret, and replace `REPLACE_ME` with the
   Smartcar client secret from the dashboard (API credentials tab, Generate new secret).
5. In the Smartcar dashboard add the app's redirect URI (see below) and publish.

## Smartcar Android SDK side

`SmartcarAuth(applicationId, redirectUri, scopes, callback)`; use application id
`a9579813-bb54-4ca3-b269-546b305d269e`, scope `read_odometer`. In the callback, POST
`{code, redirect_uri}` to `<FunctionUrl>api/audi/exchange` with header `x-api-key`.
Redirect URI format for Android is `sc<applicationId>://exchange` (verify in current Smartcar docs).

## Open questions (not verified yet)

- The code uses Smartcar **v2** endpoints. Your handoff mentions v3 (`iam.smartcar.com`, signals).
  If the v2 token exchange rejects your app, the two token/odometer calls in `src/index.mjs` need the v3 equivalents.
- Never commit the API key or the Smartcar secret. This repo is public.
- The API key lives in the Android app, so it only deters casual abuse; fine for testing, not for release.
