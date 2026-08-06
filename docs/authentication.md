# Private owner access

Mosaiq supports one configured owner account. It does not have registration, password recovery,
roles, teams, or additional users.

## Configure the owner

Choose the public login name in `.env`:

```env
AUTH_OWNER_USERNAME=owner
```

Generate an Argon2id password hash in an interactive terminal:

```bash
pnpm auth:hash-password
```

The command reads and confirms the password without echoing it and prints only the hash. Copy that
value into `.env`:

```env
AUTH_OWNER_PASSWORD_HASH='$argon2id$...'
```

Keep the hash inside single quotes so Docker Compose treats its `$` characters literally. Do not
put the plaintext password in `.env`, shell history, source control, frontend variables, or the
database. Changing the configured hash changes the password used for new logins. Existing sessions
remain valid until they expire or are revoked; to revoke every session immediately, run:

```sql
UPDATE owner_sessions SET revoked_at = now() WHERE revoked_at IS NULL;
```

Apply migrations before starting the application:

```bash
pnpm db:migrate
pnpm dev
```

## Session and proxy settings

- `AUTH_SESSION_TTL_HOURS` controls the absolute session lifetime (seven days by default).
- `AUTH_LOGIN_MAX_ATTEMPTS` and `AUTH_LOGIN_WINDOW_MINUTES` control per-client login throttling.
  Restarting the API clears the in-memory attempt counters.
- `WEB_ORIGIN` must be the exact browser origin. Authenticated mutations from other origins are
  rejected.
- Set `NODE_ENV=production` when serving over HTTPS so the session cookie receives the `Secure`
  attribute.
- Leave `API_TRUST_PROXY=false` unless the API is directly behind one trusted reverse proxy. When
  that is the topology, set it to `true` so client-address rate limiting uses the proxy-provided
  address.

The session cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api`, and inaccessible to the web
application. Only a SHA-256 digest of its random token is persisted in PostgreSQL. Logout revokes
that record server-side and clears the browser cookie.

The health endpoint reports only a minimal service status. Login and session bootstrap are public;
all library data, originals, thumbnails, metadata, settings, uploads, and processing actions
require an active session.
