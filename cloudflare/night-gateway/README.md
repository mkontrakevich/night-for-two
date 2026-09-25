# Night for Two gateway

Cloudflare Worker that forwards only `/night*` to the private application runtime.

Required bindings:

- `APP_VPC` — account-specific VPC/Tunnel service;
- `NIGHT_ORIGIN_HOST` — private host, configured in Cloudflare;
- `NIGHT_ORIGIN_PORT` — defaults to 5681.

Private network coordinates and tunnel IDs are deliberately not stored in this repository.
