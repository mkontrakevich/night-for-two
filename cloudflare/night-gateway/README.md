# Night for Two gateway

Cloudflare Worker that forwards `/night*` and `/actions*` to the private application runtime.

Required bindings:

- `APP_VPC` — account-specific VPC/Tunnel service;
- `NIGHT_ORIGIN_HOST` — private host, configured in Cloudflare;
- `NIGHT_ORIGIN_PORT` — production host port `5683`.

The standalone container listens on `5681` internally, while Docker publishes it on the isolated production host port `5683`. The Cloudflare VPC gateway must therefore target `5683`, not the container-only port.

Private network coordinates and tunnel IDs are deliberately not stored in this repository.
