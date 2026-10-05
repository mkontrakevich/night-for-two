function json(status,payload){
  return Response.json(payload,{status,headers:{'cache-control':'no-store','x-novel2-preview':'1'}});
}
export default{
  async fetch(request,env){
    const incoming=new URL(request.url);
    if(incoming.pathname==='/') return Response.redirect(new URL('/novel2/',incoming).toString(),302);
    if(!(incoming.pathname==='/novel2'||incoming.pathname.startsWith('/novel2/'))){
      return json(404,{ok:false,error:'NOVEL2_ROUTE_NOT_FOUND'});
    }
    if(!env.NOVEL2_VPC||typeof env.NOVEL2_VPC.fetch!=='function') return json(503,{ok:false,error:'NOVEL2_VPC_BINDING_MISSING'});
    const host=env.NOVEL2_ORIGIN_HOST,port=env.NOVEL2_ORIGIN_PORT||'5690';
    if(!host) return json(503,{ok:false,error:'NOVEL2_ORIGIN_HOST_MISSING'});
    const target=new URL(incoming.pathname+incoming.search,`http://${host}:${port}`);
    const upstream=new Request(target.toString(),request);
    upstream.headers.set('x-forwarded-host',incoming.host);
    upstream.headers.set('x-forwarded-proto','https');
    try{
      const response=await env.NOVEL2_VPC.fetch(upstream);
      const headers=new Headers(response.headers);
      headers.set('cache-control','no-store');
      headers.set('x-novel2-preview','1');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }catch(error){
      return json(502,{ok:false,error:'NOVEL2_ORIGIN_UNREACHABLE',detail:String(error?.message||error).slice(0,160)});
    }
  }
};
