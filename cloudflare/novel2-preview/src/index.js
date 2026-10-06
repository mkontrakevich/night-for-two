function json(status,payload,extraHeaders={}){
  return Response.json(payload,{status,headers:{'cache-control':'no-store','x-novel2-preview':'1',...extraHeaders}});
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function buildUpstream(target,request,incoming,attempt){
  const upstream=new Request(target.toString(),request);
  upstream.headers.set('x-forwarded-host',incoming.host);
  upstream.headers.set('x-forwarded-proto','https');
  upstream.headers.set('x-novel2-edge-attempt',String(attempt));
  return upstream;
}

function recoveryHtml(){
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0909">
<title>Interactive Novel 2.0</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0b0909;color:#eee4dc;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}
main{min-height:100dvh;display:grid;place-items:center;padding:28px;text-align:center}
.card{max-width:460px}.spinner{width:38px;height:38px;margin:0 auto 18px;border:2px solid #4c403a;border-top-color:#efe2d7;border-radius:50%;animation:r 1s linear infinite}
h1{font:400 34px/1.05 Georgia,serif;margin:0 0 12px}p{margin:0;color:#b8aaa0;font-size:14px;line-height:1.5}
@keyframes r{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<main><div class="card"><div class="spinner"></div><h1>Восстанавливаем соединение</h1><p>Роман сохранён. Подключение к серверу временно прервалось; приложение переподключится автоматически.</p></div></main>
<script>setTimeout(()=>location.reload(),1800)</script>
</body></html>`;
}

function recoveryPage(){
  return new Response(recoveryHtml(),{
    // Telegram WebView should keep rendering the Mini App shell while the
    // private origin reconnects. A 200 document response avoids replacing the
    // app with a raw transport error page; API/health requests still return 502.
    status:200,
    headers:{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store',
      'retry-after':'2',
      'x-novel2-preview':'1',
      'x-novel2-degraded':'origin_recovery',
      'x-novel2-origin-recovery':'1'
    }
  });
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

    // Clone the request before retries so POST bodies remain replayable.
    const sources=[];
    for(let i=0;i<5;i++) sources.push(request.clone());

    const retryDelays=[250,600,1200,2200];
    let lastError=null;
    for(let attempt=1;attempt<=sources.length;attempt++){
      try{
        const response=await env.NOVEL2_VPC.fetch(buildUpstream(target,sources[attempt-1],incoming,attempt));
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        headers.set('x-novel2-preview','1');
        if(attempt>1)headers.set('x-novel2-edge-retry',String(attempt-1));
        return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
      }catch(error){
        lastError=error;
        if(attempt<sources.length)await sleep(retryDelays[attempt-1]||2200);
      }
    }

    // Never expose raw transport JSON as the whole Telegram Mini App page.
    // Keep a lightweight self-healing shell on document navigation while the
    // tunnel reconnects; API/health calls still receive structured JSON.
    const isDocument=(request.method==='GET'||request.method==='HEAD')&&(incoming.pathname==='/novel2'||incoming.pathname==='/novel2/');
    if(isDocument)return recoveryPage();

    return json(502,{
      ok:false,
      error:'NOVEL2_ORIGIN_UNREACHABLE',
      retryable:true,
      detail:String(lastError?.message||lastError||'origin unavailable').slice(0,160)
    },{'retry-after':'2'});
  }
};
