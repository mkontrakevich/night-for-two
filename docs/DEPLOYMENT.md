# Night for Two — standalone deployment

## Boundary

This repository runs the application. The MARINS Reminder Bot remains the owner of conversation analysis and relationship-history collection.

The only cross-project integration is:

```
Night for Two -> RELATIONSHIP_CONTEXT_URL
```

The connector accepts sanitized aggregate context and rejects raw-message payloads. In production, this connector travels over a dedicated Docker network shared only by the reminder bot container and the Night application container; the Night PostgreSQL service is not attached to that network.

## Local Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Application:

```
http://localhost:5681/night
http://localhost:5681/night/health
```

## Required secrets

Never commit real values.

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `PRIMARY_OWNER_ID`
- `PARTNER_TELEGRAM_ID`
- `OPENROUTER_API_KEY`
- `RELATIONSHIP_CONTEXT_URL`
- `RELATIONSHIP_CONTEXT_TOKEN`

## Public HTTPS

Cloudflare components live in:

- `cloudflare/night-pages`
- `cloudflare/night-gateway`

The public base URL is stored in `NIGHT_PAGES_URL` outside Git.

`tools/publish-pages.ps1` verifies `/night/health` and updates the Telegram Web App menu for the two configured accounts. It contains no built-in Telegram IDs.

## Full novel generation

Use the manual workflow `.github/workflows/generate-full-novel.yml`.

It starts the standalone Docker stack, probes the novel store, runs generation, and requires the final status probe to report complete.

## Rollback

Application code and relationship-history data are separated. A Night for Two rollback must not touch the bot database or conversation-analysis state.


## Automated Cloudflare deployment

Production Cloudflare gateway deployment is defined in `.github/workflows/cloudflare-deploy.yml`.

The workflow deliberately keeps account-specific network coordinates out of Git. It activates only when all four GitHub Actions secrets exist:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_TUNNEL_ID`
- `NIGHT_ORIGIN_HOST`

Optional repository variable `NIGHT_PAGES_URL` enables the post-deploy `/night/health` smoke test.

The checked-in `cloudflare/night-gateway/wrangler.jsonc` remains a safe template. CI renders a temporary deployment config containing the tunnel ID and private origin host and never commits it.

After the initial Cloudflare Pages project has its `NIGHT_GATEWAY` service binding, subsequent gateway changes under `cloudflare/**` deploy automatically from `main`.


## Standalone production origin

The standalone application is isolated from the reminder bot at the host-port boundary.

- container port: `5681`
- production host port: `5683`
- Cloudflare private origin: the existing MARINS production host on port `5683`
- sanitized relationship-context network: `night_for_two_context`
- Night PostgreSQL remains on the Night project network only
- existing bot services keep their current ports unchanged

`.github/workflows/deploy-origin.yml` deploys the standalone Docker Compose project on the existing `marins-production` self-hosted runner and verifies `http://127.0.0.1:5683/night/health`.

This deployment workflow intentionally does not modify reader/story files. Reader work can proceed independently and will be picked up by the same standalone runtime after it lands on `main`.
