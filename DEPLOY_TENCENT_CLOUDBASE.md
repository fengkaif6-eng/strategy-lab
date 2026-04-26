# Tencent Cloud CloudBase Deployment

This project can be tested on Tencent Cloud in mainland China with:

- Front-end: CloudBase Static Website Hosting
- Back-end: CloudBase Run
- Unified entry: CloudBase HTTP Access Service

## Project Paths

- Project root: `C:\Users\18884\Desktop\label\strategy-lab`
- Front-end build output: `C:\Users\18884\Desktop\label\strategy-lab\dist`
- FastAPI entrypoint: `backend.app.main:app`
- Health check endpoint: `/api/health`

## 1. Build the Front-end Locally

From the project root:

```powershell
npm ci
npm run build
```

Upload the contents inside `dist`, not the outer `dist` folder itself.

Static hosting root should contain:

- `index.html`
- `assets/`

## 2. Deploy the Back-end to CloudBase Run

Use the root `Dockerfile` in this repository.

CloudBase Run service settings:

- Port: `8000`
- Health check path: `/api/health`
- Start command: leave empty if CloudBase uses the `Dockerfile` command

Required environment variables for persistent backend data:

- `MARKET_API_ALLOWED_ORIGINS=https://<your-http-access-service-domain>`
- `MARKET_SHARED_STORE_MONGODB_URI=<your-shared-mongodb-uri>`
- `MARKET_SHARED_STORE_MONGODB_DB=strategy_lab`
- `MARKET_SHARED_STORE_MONGODB_COLLECTION=shared_kv`
- `MARKET_SHARED_STORE_REQUIRED=1` (explicitly keep strict mode)

The service defaults to strict shared store mode.
If Mongo is unavailable, the container fails fast instead of falling back to per-instance local files.

If you temporarily test front-end and back-end on different domains, add every allowed front-end origin as a comma-separated list:

```text
MARKET_API_ALLOWED_ORIGINS=https://site-a.example.com,https://site-b.example.com
```

## 3. Configure HTTP Access Service

Create one HTTP access service and map:

- `/` -> Static Website Hosting
- `/api` -> CloudBase Run back-end service

Enable path passthrough for `/api`.

With this setup, the front-end can keep using same-origin API requests such as:

```text
/api/market/home
```

That matches the current front-end implementation and avoids extra CORS work.

## 4. Optional Separate-Domain Front-end Build

If you decide not to use HTTP Access Service and instead call the CloudBase Run service directly from the static site, create a local `.env.production` before building:

```text
VITE_MARKET_API_BASE_URL=https://<your-cloudbase-run-domain>
```

Then rebuild:

```powershell
npm run build
```

## 5. Pre-Upload Checklist

- Front-end build succeeds locally: `npm run build`
- Back-end tests pass locally: `python -m unittest backend.tests.test_market_service`
- `Dockerfile` exists at the project root
- CloudBase Run port is set to `8000`
- CloudBase Run health check is `/api/health`
- `MARKET_API_ALLOWED_ORIGINS` is configured correctly
- Static hosting receives the contents of `dist`

## 6. Smoke Test After Deployment

Check these URLs in order:

1. `https://<your-domain>/`
2. `https://<your-domain>/api/health`
3. `https://<your-domain>/api/market/home`

Expected health response:

```json
{"status":"ok","sharedStoreMode":"mongo","sharedStoreStrict":true}
```

## 7. Notes

- This repository's `Dockerfile` installs `tzdata` because the back-end uses `Asia/Shanghai`.
- For same-domain testing via HTTP Access Service, `VITE_MARKET_API_BASE_URL` should stay unset.
- For formal production rollout on a custom mainland-China domain, ICP filing requirements still apply.
