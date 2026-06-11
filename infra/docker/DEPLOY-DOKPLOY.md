# Deploying RyTask on Dokploy

The production entry point is **`docker-compose.production.yml`** at the repo root. One compose
deployment runs the whole product: `postgres`, `redis`, one-shot `migrate`, `api`, `worker`,
`web`, `docs`, and a `backup` sidecar. Dokploy's Traefik terminates TLS and routes domains to the
services over `dokploy-network` — the compose file publishes **no host ports**.

```
app.example.com   → web   (container port 3000)
api.example.com   → api   (container port 3001)   REST + WebSockets + MCP HTTP
docs.example.com  → docs  (container port 3002)   Fumadocs site
```

## Prerequisites

- A server with [Dokploy installed](https://docs.dokploy.com) (`curl -sSL https://dokploy.com/install.sh | sh`).
- **≥ 4 GB RAM + 2 vCPU** (8 GB comfortable). Images build *on the server*: each of the three
  app images runs a full `pnpm install` + turbo build of the monorepo. Add swap on small VPSes.
- DNS `A` records for `app.`, `api.`, and `docs.` subdomains pointing at the server.

## 1. Create the compose service

1. Dokploy UI → **Create Project** → inside it **Create Service → Compose**.
2. **Compose Type: Docker Compose** (NOT Stack — Stack mode cannot `build`).
3. Provider: your GitHub repo (or Git URL), branch `main`.
4. **Compose Path:** `./docker-compose.production.yml`.

## 2. Environment

Open the service's **Environment** tab and paste a filled-in copy of
[`.env.production.example`](../../.env.production.example). Dokploy writes it to the `.env` file
next to the compose file; the compose file interpolates everything from there (Dokploy does
**not** auto-inject UI env vars into containers — interpolation is deliberate).

Required: `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET` (≥ 32 chars — the API refuses to
boot in production without it), `PUBLIC_WEB_URL`, `PUBLIC_API_URL`. The deploy fails fast with a
named error if any is missing.

> `PUBLIC_API_URL` is baked into the web browser bundle at **build** time
> (`NEXT_PUBLIC_API_URL` build arg). Changing it needs an image rebuild (any redeploy rebuilds),
> never just a restart.

## 3. Domains

Service → **Domains** tab → add three entries (HTTPS on, certificate **Let's Encrypt**):

| Host | Service Name | Container Port |
|------|--------------|----------------|
| `app.example.com`  | `web`  | `3000` |
| `api.example.com`  | `api`  | `3001` |
| `docs.example.com` | `docs` | `3002` |

Dokploy generates the Traefik labels itself — don't add any to the compose file. Unlike
"Application" services, **compose domain changes only take effect after a redeploy**.

## 4. Deploy & first boot

1. Hit **Deploy**. The first build is the slow one (~10–20 min); later deploys reuse Docker
   layer + pnpm caches.
2. Boot order is automatic: postgres healthy → `migrate` runs transactional migrations (with a
   retry loop for the cold-start DNS race) → api/worker/web start. **The production stack never
   runs the seed** — it would create `founder@rytask.local` with a known password.
3. First boot: deploy with `ALLOW_PUBLIC_SIGNUP=true`, register your founder account at
   `https://app.example.com`, then set it back to `false` and redeploy.
4. Enable **AutoDeploy** (service settings) to redeploy on every push to `main`.

## 5. Integrations (all optional, inert until configured)

- **Slack capture:** set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, and
  `SLACK_TOKEN_ENC_KEY` (`openssl rand -base64 32`). The Slack app's redirect URL must be
  `https://api.example.com/integrations/slack/oauth/callback` (root path — no `/api/v1`).
- **GitHub linking:** create the connection in the RyTask UI; the webhook target is
  `https://api.example.com/api/v1/integrations/github/webhook/<connectionId>`. Encryption uses
  `GITHUB_TOKEN_ENC_KEY` (falls back to `SLACK_TOKEN_ENC_KEY`).
- **MCP (HTTP):** agents connect to `https://api.example.com/api/v1/mcp` with a PAT minted on
  the Agent-access page. `MCP_PUBLIC_URL` is derived from `PUBLIC_API_URL` automatically.

## 6. Backups

The `backup` sidecar runs `pg_dump -Fc` every `BACKUP_SCHEDULE_HOURS` (default 6) into the
`dbbackups` named volume, rotating after `BACKUP_RETENTION_DAYS` (default 30). To get them
**off-host**, point Dokploy's **Volume Backups** (S3) at the `dbbackups` volume.

Restore (from inside the project network):

```bash
docker compose -f docker-compose.production.yml exec backup \
  sh -c 'pg_restore -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /backups/<file>.dump'
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| api/worker exit immediately, log says `JWT_SECRET` | The production boot guard — set a real ≥ 32-char secret. |
| Login fails / browser POSTs to the web origin | `PUBLIC_API_URL` was wrong at build time. Fix the env and **redeploy** (rebuild). Verify with `docker compose exec web grep -rl api.example.com .next/static`. |
| `migrate` logs `getaddrinfo ENOTFOUND postgres` | Cold-start DNS race; the retry loop absorbs it. If it exhausts 10 attempts, just redeploy. |
| `network dokploy-network not found` (local run) | That network is external and exists only on a Dokploy host. Locally use the dev stack (`make up`) instead. |
| Slack refuses to boot: `SLACK_TOKEN_ENC_KEY is required` | You set the three Slack secrets without the enc key — generate one (`openssl rand -base64 32`). |
| Containers unreachable from Traefik | The service must be on `dokploy-network` (only `web`/`api`/`docs` are — by design). Don't add `container_name` (breaks Dokploy logs/metrics). |

## Notes on the deliberately-internal services

`postgres`, `redis`, `worker`, `migrate`, and `backup` live only on the private
`rytask-internal` network: they are reachable by the app but **not** by Traefik or by other
apps deployed on the same Dokploy host. Redis runs with `maxmemory-policy noeviction`
(required by BullMQ) and AOF persistence so queued jobs survive restarts.
