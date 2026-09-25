function json(status, payload) {
  return Response.json(payload,{status,headers:{'cache-control':'no-store'}});
}

export default {
  async fetch(request, env) {
    const incoming=new URL(request.url);
    if(!incoming.pathname.startsWith('/night')) return json(404,{ok:false,error:'NIGHT_ROUTE_NOT_FOUND'});
    if(!env.APP_VPC || typeof env.APP_VPC.fetch!=='function') return json(503,{ok:false,error:'APP_VPC_BINDING_MISSING'});
    const host=env.NIGHT_ORIGIN_HOST;
    const port=env.NIGHT_ORIGIN_PORT||'5681';
    if(!host) return json(503,{ok:false,error:'NIGHT_ORIGIN_HOST_MISSING'});
    const target=new URL(incoming.pathname+incoming.search,`http://${host}:${port}`);
    const upstream=new Request(target.toString(),request);
    upstream.headers.set('x-forwarded-host',incoming.host);
    upstream.headers.set('x-forwarded-proto','https');
    try{return await env.APP_VPC.fetch(upstream);}
    catch(error){return json(502,{ok:false,error:'NIGHT_ORIGIN_UNREACHABLE',detail:String(error?.message||error).slice(0,160)});}
  }
};
