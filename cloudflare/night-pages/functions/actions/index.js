export async function onRequest(context) {
  const gateway=context.env.NIGHT_GATEWAY;
  if(!gateway||typeof gateway.fetch!=='function')return Response.json({ok:false,error:'NIGHT_GATEWAY_BINDING_MISSING'},{status:503});
  return gateway.fetch(context.request);
}
