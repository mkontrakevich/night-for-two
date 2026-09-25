# Night for Two

Standalone application extracted from `marins-reminder-bot`.

## Boundary

This repository owns the application experience only:

- two-player Night runtime and Mini App;
- story/gamebook engine;
- Reader and DEMO 01 «Комната №17»;
- serial-novel generation;
- illustration generation and visual AI;
- application-local session state, choices and feedback;
- Cloudflare front door/gateway and application deployment.

It intentionally does **not** contain:

- raw couple messages;
- conversation analysis;
- relationship-history ingestion;
- couple profile observations/preferences/dynamics;
- relationship passports or AI hypotheses derived from conversation.

The only boundary with the bot is `src/integrations/relationship-context-connector.js`. It accepts a sanitized aggregate context and never requests raw messages.

## Required environment

```env
DATABASE_URL=
TELEGRAM_BOT_TOKEN=
PRIMARY_OWNER_ID=
PARTNER_TELEGRAM_ID=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4.1-mini
PERSONAL_IMAGE_MODEL=bytedance-seed/seedream-4.5
PERSONAL_IMAGE_FALLBACK_MODEL=google/gemini-2.5-flash-image
RELATIONSHIP_CONTEXT_URL=
RELATIONSHIP_CONTEXT_TOKEN=
PORT=5681
```

## Run

```bash
npm install
npm test
npm start
```

App health endpoint: `/night/health`.

## Privacy contract

The relationship connector requires `raw_messages: false`. Any payload that declares raw messages is rejected. Private game choices remain application-local and are not used to rebuild the bot's relationship profile.
