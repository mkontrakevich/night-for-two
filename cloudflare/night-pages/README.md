# Night for Two — Cloudflare Pages front door

Architecture:

```text
Telegram
  -> https://<project>.pages.dev/night (interactive story)
  -> https://<project>.pages.dev/actions (separate physical actions product)
  -> Cloudflare Pages Function
  -> service binding NIGHT_GATEWAY
  -> Worker night42 (optional secondary Pages route)
  -> VPC binding NIGHT_VPC
  -> private application origin :5683/night
```

Git setup:

- repository: `mkontrakevich/night-for-two`
- production branch: `main`
- root directory: `cloudflare/night-pages`
- build command: empty
- output directory: `public`
- service binding: `NIGHT_GATEWAY`

The application container still listens on `5681`; the existing production host exposes this isolated product on `5683`.

Do not commit the private origin host, tunnel identifier or account-specific credentials.

The chosen public product address is `https://night42.kontrakevich.workers.dev`; this Pages route is optional. The actions route has its own interface, API and PostgreSQL tables. Reader content is left unchanged; story-to-action links will be added after the action product is reviewed.

Product behavior and the story-context contract: `docs/NIGHT_ACTIONS_PRODUCT.md`.
