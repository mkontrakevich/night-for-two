# Night for Two — Cloudflare Pages front door

Architecture:

```text
Telegram
  -> https://<project>.pages.dev/night
  -> Cloudflare Pages Function
  -> service binding NIGHT_GATEWAY
  -> Worker night-for-two-gateway
  -> VPC binding APP_VPC
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
