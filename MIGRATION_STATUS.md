# Migration validation

Final standalone migration checks:

- application runtime, Reader, Room 17 and story engine are owned by this repository;
- OpenRouter text/image integrations are local to this repository;
- Stable Diffusion story-illustration pipeline is local to this repository;
- Cloudflare Pages/Gateway assets and standalone deployment contracts are local to this repository;
- real Telegram IDs and personal names are not committed;
- raw couple messages and relationship-history analysis are not stored or implemented here;
- the only bot boundary is the sanitized relationship-context connector;
- CI runs Node regression tests and Python illustration-pipeline tests.

This file exists to anchor the final migration validation pull request.
