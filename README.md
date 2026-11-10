# Acquisitions API – Docker setup (Neon Local for dev, Neon Cloud for prod)

| | Development | Production |
| --- | --- | --- |
| Compose file | `docker-compose.dev.yml` | `docker-compose.prod.yml` |
| Env file | `.env.development` | `.env.production` |
| Database | Neon Local proxy → **ephemeral branch** of your Neon project | Neon Cloud (serverless Postgres) |
| `DATABASE_URL` | `postgres://neon:npg@neon-local:5432/neondb` | `postgres://…neon.tech/…?sslmode=require` |
| Docker target | `development` (hot reload, dev deps) | `production` (prod deps only, non-root) |

> Neon Local's default credentials are `neon` / `npg` and database `neondb`, not `user` / `password`.
> The production compose file contains only the app: Neon Cloud is serverless and has no container.

## How `DATABASE_URL` switches

- **Dev:** compose sets `DATABASE_URL` to the `neon-local` service and `NEON_LOCAL_ENDPOINT=http://neon-local:5432/sql`.
  [`src/config/db.js`](src/config/db.js) sees `NEON_LOCAL_ENDPOINT` and points the Neon serverless driver at Neon Local's HTTP endpoint (plain HTTP, no websockets).
- **Prod:** `.env.production` supplies the Neon Cloud URL. `NEON_LOCAL_ENDPOINT` is unset, so the driver uses Neon's defaults.

No URLs or secrets are hardcoded. The env files are git-ignored.

## Development

1. Get a Neon API key (Console → Account → API keys) and your Project ID (Project Settings → General).
2. Edit `.env.development` and set `NEON_API_KEY` and `NEON_PROJECT_ID` (plus `ARCJET_KEY`).
   Optionally set `PARENT_BRANCH_ID` to fork from a branch other than the default.
3. Start everything:

   ```bash
   docker compose --env-file .env.development -f docker-compose.dev.yml up --build
   ```

   `--env-file` is needed so compose can interpolate `NEON_API_KEY` etc. into the `neon-local` service.
4. Run migrations against the fresh branch (the branch is new each start, so it has no tables yet):

   ```bash
   docker compose --env-file .env.development -f docker-compose.dev.yml exec app npm run db:migrate
   ```

5. App: http://localhost:3000. Postgres (psql, GUI tools): `postgres://neon:npg@localhost:5432/neondb`.
6. Stop with `Ctrl+C` / `docker compose ... down`. The ephemeral branch is deleted on shutdown. Set `DELETE_BRANCH=false` to keep it.

Source in `src/` is bind-mounted and `node --watch` reloads on change.

## Production

1. Fill `.env.production` (or inject the same variables from your platform's secret manager): `DATABASE_URL` (Neon Cloud, use the **pooled** connection string), `JWT_SECRET`, `ARCJET_KEY`.
2. Run migrations from CI or a trusted machine (the prod image has no drizzle-kit):

   ```bash
   DATABASE_URL="postgres://…neon.tech/…" npm run db:migrate
   ```

3. Build and run:

   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   docker compose -f docker-compose.prod.yml logs -f app
   ```

## npm shortcuts

| Script | Does |
| --- | --- |
| `npm run docker:dev` | Build and start app + Neon Local (foreground) |
| `npm run docker:dev:detach` | Same, in the background |
| `npm run docker:dev:migrate` | Run Drizzle migrations in the dev app container |
| `npm run docker:dev:logs` | Follow dev logs |
| `npm run docker:dev:down` | Stop dev stack (deletes the ephemeral branch) |
| `npm run docker:prod` | Build and start the production app (detached) |
| `npm run docker:prod:logs` | Follow production app logs |
| `npm run docker:prod:down` | Stop the production app |

## Files

- `Dockerfile` – multi-stage: `development` and `production` targets
- `.dockerignore` – keeps `.env*`, `node_modules`, `.git` out of images
- `docker-compose.dev.yml` / `docker-compose.prod.yml`
- `.env.development` / `.env.production` – git-ignored config
