# Night for Two gateway

Cloudflare Worker `night42` at `https://night42.kontrakevich.workers.dev`. Its root opens `/reader/` (the published illustrated story). It forwards `/night*` and `/actions*` to the private Night application runtime.

Required bindings:

- `NIGHT_VPC` — the binding used by the last verified working `night42` version;
- `NIGHT_ORIGIN_HOST` — the private host preserved from the last verified working Worker version during deployment;
- `NIGHT_ORIGIN_PORT` — production host port `5683`.

The standalone container listens on `5681` internally, while Docker publishes it on the isolated production host port `5683`. The Cloudflare VPC gateway must therefore target `5683`, not the container-only port.

Private network coordinates and tunnel IDs are deliberately not stored in this repository. The deployment checks the existing working application routes, then reuses their exact VPC binding and origin host. It rolls back to the verified working Worker version if public health checks fail.

The existing READER services are separate. The Worker serves a copy of the public illustrated story under `/reader/`; the `/actions` product uses the isolated Night runtime. The deploy workflow only targets this Worker name and never updates READER services.
