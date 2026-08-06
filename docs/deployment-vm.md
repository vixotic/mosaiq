# VM deployment notes

These notes target a single OCI VM running the API as a systemd service, Caddy as the public HTTPS
entry point, Neon PostgreSQL, and optional OCI Object Storage for image binaries. They are written
for `https://mosaiq.vixotic.in`; do not point DNS at the VM until the service is configured and
verified locally on the host.

## Build on the VM

```bash
cd /opt/mosaiq
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
```

## Environment

Create `/etc/mosaiq/api.env`, owned by `root:mosaiq` and mode `0640`.

```env
NODE_ENV=production
DATABASE_URL=<neon pooled or direct connection string>
API_HOST=127.0.0.1
API_PORT=3001
WEB_ORIGIN=https://mosaiq.vixotic.in
API_TRUST_PROXY=true
AUTH_OWNER_USERNAME=<owner name>
AUTH_OWNER_PASSWORD_HASH='<argon2id hash from pnpm auth:hash-password>'
AUTH_SESSION_TTL_HOURS=168
AUTH_LOGIN_MAX_ATTEMPTS=5
AUTH_LOGIN_WINDOW_MINUTES=15
STORAGE_DRIVER=oci
OCI_AUTH_MODE=instance_principal
OCI_OBJECT_STORAGE_NAMESPACE=<namespace>
OCI_OBJECT_STORAGE_BUCKET=mosaiq-images
OCI_OBJECT_STORAGE_REGION=ap-hyderabad-1
OCI_OBJECT_STORAGE_PREFIX=mosaiq
AI_PROVIDER=gemini
GEMINI_API_KEY=<backend-only key>
GEMINI_MODEL=gemini-flash-latest
PROCESSING_WORKER_ENABLED=true
```

Use `STORAGE_DRIVER=filesystem` and keep `/opt/mosaiq/storage` writable if Object Storage is not
enabled yet. Keep `VITE_API_URL` unset for the production frontend so browser requests use `/api`.

## Service files

```bash
sudo install -D -m 0644 deploy/mosaiq-api.service /etc/systemd/system/mosaiq-api.service
sudo install -D -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now mosaiq-api
sudo systemctl reload caddy
```

## Smoke checks from the VM

```bash
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3001/api/auth/session
curl -I --resolve mosaiq.vixotic.in:443:127.0.0.1 https://mosaiq.vixotic.in/
curl -i --resolve mosaiq.vixotic.in:443:127.0.0.1 https://mosaiq.vixotic.in/api/health
```

After DNS points to the VM, repeat the HTTPS checks without `--resolve`, then sign in through the
browser and upload a small image.
