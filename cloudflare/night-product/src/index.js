function json(status, payload) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store', 'x-night-product': 'night-for-two' },
  });
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname === '/') {
      return Response.redirect(new URL('/night', incoming).toString(), 302);
    }
    if (!['/night', '/actions'].some(prefix =>
      incoming.pathname === prefix || incoming.pathname.startsWith(prefix + '/')
    )) {
      return json(404, { ok: false, error: 'NIGHT_ROUTE_NOT_FOUND' });
    }
    if (!env.NIGHT_VPC || typeof env.NIGHT_VPC.fetch !== 'function') {
      return json(503, { ok: false, error: 'NIGHT_VPC_BINDING_MISSING' });
    }
    const host = env.NIGHT_ORIGIN_HOST;
    const port = env.NIGHT_ORIGIN_PORT || '5683';
    if (!host) return json(503, { ok: false, error: 'NIGHT_ORIGIN_HOST_MISSING' });

    const target = new URL(incoming.pathname + incoming.search, `http://${host}:${port}`);
    const upstream = new Request(target.toString(), request);
    upstream.headers.set('x-forwarded-host', incoming.host);
    upstream.headers.set('x-forwarded-proto', 'https');
    try {
      const response = await env.NIGHT_VPC.fetch(upstream);
      const headers = new Headers(response.headers);
      headers.set('x-night-product', 'night-for-two');
      headers.set('cache-control', 'no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      return json(502, {
        ok: false,
        error: 'NIGHT_ORIGIN_UNREACHABLE',
        detail: String(error?.message || error).slice(0, 160),
      });
    }
  },
};
