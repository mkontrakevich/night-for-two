function unavailable(message) {
  return Response.json({ ok: false, error: message }, { status: 503, headers: { 'cache-control': 'no-store' } });
}

export async function onRequest(context) {
  const gateway = context.env.NIGHT_GATEWAY;
  if (!gateway || typeof gateway.fetch !== 'function') return unavailable('NIGHT_GATEWAY_BINDING_MISSING');
  return gateway.fetch(context.request);
}
