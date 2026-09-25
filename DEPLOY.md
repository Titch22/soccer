# Deploying Soccer Web

Client = static files, server = one Node process (HTTP + WebSocket on one port), nginx in front.

## Build
```sh
pnpm install --frozen-lockfile
pnpm build            # client -> packages/client/dist, server -> packages/server/dist/index.js
```
The client derives its server URL at runtime: `wss://<your-host>/ws` in production.
Override at build time with `VITE_SERVER_URL=wss://ws.example.com pnpm build` (e.g. for a dedicated subdomain).

## Server
1. On the VPS: `pnpm install --frozen-lockfile && pnpm build` (build needs dev dependencies, so no `--prod`).
2. Start it: `cd packages/server && NODE_ENV=production PORT=2567 node dist/index.js`
   Environment variables: `PORT`, `HOST` (defaults to 127.0.0.1 in production), `MIN_PLAYERS_TO_START`.
3. Check: `curl http://127.0.0.1:2567/health`.

## nginx
1. Copy `packages/client/dist/*` to `/var/www/soccer`.
2. Adapt `deploy/nginx.conf` (server_name), enable it, run certbot, `nginx -s reload`.

## Notes
- Rooms live in memory: run a single server instance.
- The `/ws/` location strips its prefix (trailing slash on `proxy_pass`). If matchmaking fails, check that first.
