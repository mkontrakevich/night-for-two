const READER_ORIGIN='https://mkontrakevich.github.io/night-for-two/';

function json(status, payload) {
  return Response.json(payload,{status,headers:{'cache-control':'no-store'}});
}

async function readerResponse(request,incoming){
  if(incoming.pathname==='/') {
    return Response.redirect(new URL('/night',incoming).toString(),302);
  }
  if(incoming.pathname==='/reader') {
    return Response.redirect(new URL('/reader/',incoming).toString(),302);
  }
  if(!(incoming.pathname==='/reader/'||incoming.pathname.startsWith('/reader/'))) return null;

  const relative=incoming.pathname.replace(/^\/reader\/?/,'');
  const target=new URL(relative||'index.html',READER_ORIGIN);
  target.search=incoming.search;
  const headers=new Headers(request.headers);
  headers.delete('host');
  const upstream=new Request(target.toString(),{method:request.method,headers,redirect:'follow'});
  const response=await fetch(upstream);
  const outHeaders=new Headers(response.headers);
  outHeaders.set('cache-control',relative.endsWith('.json')?'no-store':'public, max-age=300');
  outHeaders.set('x-night-product','reader');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:outHeaders});
}

export default {
  async fetch(request, env) {
    const incoming=new URL(request.url);

    const reader=await readerResponse(request,incoming);
    if(reader) return reader;

    if(!['/night','/actions'].some(prefix=>incoming.pathname===prefix||incoming.pathname.startsWith(prefix+'/'))) {
      return json(404,{ok:false,error:'NIGHT_ROUTE_NOT_FOUND'});
    }
    if(!env.NIGHT_VPC || typeof env.NIGHT_VPC.fetch!=='function') return json(503,{ok:false,error:'NIGHT_VPC_BINDING_MISSING'});
    const host=env.NIGHT_ORIGIN_HOST;
    const port=env.NIGHT_ORIGIN_PORT||'5681';
    if(!host) return json(503,{ok:false,error:'NIGHT_ORIGIN_HOST_MISSING'});
    const target=new URL(incoming.pathname+incoming.search,`http://${host}:${port}`);
    const upstream=new Request(target.toString(),request);
    upstream.headers.set('x-forwarded-host',incoming.host);
    upstream.headers.set('x-forwarded-proto','https');
    try{return await env.NIGHT_VPC.fetch(upstream);}
    catch(error){return json(502,{ok:false,error:'NIGHT_ORIGIN_UNREACHABLE',detail:String(error?.message||error).slice(0,160)});}
  }
};
