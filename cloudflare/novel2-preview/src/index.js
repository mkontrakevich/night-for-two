function json(status,payload,extraHeaders={}){
  return Response.json(payload,{status,headers:{'cache-control':'no-store','x-novel2-preview':'1',...extraHeaders}});
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const AI_TEXT_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const AI_VISION_MODEL='@cf/meta/llama-4-scout-17b-16e-instruct';
const AI_IMAGE_MODEL='@cf/black-forest-labs/flux-2-klein-4b';

function bytesToHex(bytes){
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function expectedServiceKey(secret=''){
  const raw=new TextEncoder().encode('novel2-ai-v1:'+String(secret||''));
  return bytesToHex(await crypto.subtle.digest('SHA-256',raw));
}
function equalString(a='',b=''){
  a=String(a);b=String(b);
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function aiAuthorized(request,env){
  if(!env.NOVEL2_SERVICE_SECRET)return false;
  const got=request.headers.get('x-novel2-service-key')||'';
  return equalString(got,String(env.NOVEL2_SERVICE_SECRET||''));
}
function dataUrlBlob(value=''){
  const m=String(value||'').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!m)return null;
  const binary=atob(m[2]);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:m[1]});
}
function workerTextContent(result){
  return String(
    result?.choices?.[0]?.message?.content ??
    result?.response ??
    result?.result?.response ??
    ''
  );
}
async function handleAi(request,env,incoming){
  if(request.method!=='POST')return json(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!await aiAuthorized(request,env))return json(401,{ok:false,error:'NOVEL2_AI_EDGE_UNAUTHORIZED'});
  if(!env.AI||typeof env.AI.run!=='function')return json(503,{ok:false,error:'NOVEL2_AI_BINDING_MISSING'});
  if(incoming.pathname==='/novel2-ai/vpc-probe'){
    if(!env.NOVEL2_VPC||typeof env.NOVEL2_VPC.fetch!=='function')return json(503,{ok:false,error:'NOVEL2_VPC_BINDING_MISSING'});
    const host=env.NOVEL2_ORIGIN_HOST;
    if(!host)return json(503,{ok:false,error:'NOVEL2_ORIGIN_HOST_MISSING'});
    async function probe(port,path){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort('probe timeout'),4000);
      try{
        const response=await env.NOVEL2_VPC.fetch(new Request(`http://${host}:${port}${path}`,{signal:controller.signal}));
        return{ok:response.ok,status:response.status};
      }catch(error){
        return{ok:false,status:0,error:String(error?.message||error||'failed').slice(0,100)};
      }finally{clearTimeout(timer)}
    }
    const [night,novel2]=await Promise.all([
      probe('5683','/night/health'),
      probe(env.NOVEL2_ORIGIN_PORT||'5690','/novel2/health')
    ]);
    return json(200,{ok:true,night,novel2});
  }


  if(incoming.pathname==='/novel2-ai/text'){
    let body={};
    try{body=await request.json();}catch{return json(400,{ok:false,error:'NOVEL2_AI_EDGE_JSON_REQUIRED'});}
    const messages=Array.isArray(body.messages)?body.messages.slice(0,20).map(x=>({
      role:['system','user','assistant'].includes(String(x?.role))?String(x.role):'user',
      content:typeof x?.content==='string'?x.content:JSON.stringify(x?.content??'')
    })):[];
    if(!messages.length)return json(400,{ok:false,error:'NOVEL2_AI_EDGE_MESSAGES_REQUIRED'});
    const input={
      messages,
      temperature:Number.isFinite(Number(body.temperature))?Math.max(0,Math.min(2,Number(body.temperature))):0.7,
      max_tokens:Math.max(32,Math.min(8000,Number(body.max_tokens||body.max_completion_tokens||5000)))
    };
    if(body.json_mode)input.response_format={type:'json_object'};
    try{
      const result=await env.AI.run(AI_TEXT_MODEL,input);
      const content=workerTextContent(result);
      if(!content)return json(502,{ok:false,error:'NOVEL2_AI_EDGE_EMPTY_TEXT',model:AI_TEXT_MODEL});
      return json(200,{ok:true,content,model:AI_TEXT_MODEL,usage:result?.usage||null});
    }catch(error){
      return json(502,{ok:false,error:'NOVEL2_AI_EDGE_TEXT_FAILED',detail:String(error?.message||error).slice(0,220),model:AI_TEXT_MODEL});
    }
  }

  if(incoming.pathname==='/novel2-ai/vision'){
    let body={};
    try{body=await request.json();}catch{return json(400,{ok:false,error:'NOVEL2_AI_EDGE_JSON_REQUIRED'});}
    const system=String(body.system||'').slice(0,18000);
    const text=String(body.text||'').slice(0,18000);
    const content=[{type:'text',text}];
    const images=Array.isArray(body.images)?body.images.slice(0,4):[];
    for(const value of images){
      const url=String(value||'');
      if(/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(url))content.push({type:'image_url',image_url:{url}});
    }
    if(content.length<2)return json(400,{ok:false,error:'NOVEL2_AI_EDGE_VISION_IMAGE_REQUIRED'});
    try{
      const result=await env.AI.run(AI_VISION_MODEL,{
        messages:[
          ...(system?[{role:'system',content:system}]:[]),
          {role:'user',content}
        ],
        temperature:Number.isFinite(Number(body.temperature))?Math.max(0,Math.min(2,Number(body.temperature))):0.1,
        max_tokens:Math.max(64,Math.min(5000,Number(body.max_tokens||2600)))
      });
      const output=workerTextContent(result);
      if(!output)return json(502,{ok:false,error:'NOVEL2_AI_EDGE_EMPTY_VISION',model:AI_VISION_MODEL});
      return json(200,{ok:true,content:output,model:AI_VISION_MODEL,usage:result?.usage||null});
    }catch(error){
      return json(502,{ok:false,error:'NOVEL2_AI_EDGE_VISION_FAILED',detail:String(error?.message||error).slice(0,220),model:AI_VISION_MODEL});
    }
  }

  if(incoming.pathname==='/novel2-ai/image'){
    let body={};
    try{body=await request.json();}catch{return json(400,{ok:false,error:'NOVEL2_AI_EDGE_JSON_REQUIRED'});}
    const prompt=String(body.prompt||'').trim().slice(0,12000);
    if(!prompt)return json(400,{ok:false,error:'NOVEL2_AI_EDGE_PROMPT_REQUIRED'});
    const width=Math.max(256,Math.min(1920,Number(body.width||1024)));
    const height=Math.max(256,Math.min(1920,Number(body.height||1280)));
    const form=new FormData();
    form.append('prompt',prompt);
    form.append('width',String(width));
    form.append('height',String(height));
    const refs=Array.isArray(body.input_references)?body.input_references.slice(0,4):[];
    let refIndex=0;
    for(const ref of refs){
      const blob=dataUrlBlob(ref);
      if(!blob)continue;
      form.append('input_image_'+refIndex,blob,'reference-'+refIndex+'.jpg');
      refIndex++;
    }
    const encoded=new Response(form);
    try{
      const result=await env.AI.run(AI_IMAGE_MODEL,{
        multipart:{
          body:encoded.body,
          contentType:encoded.headers.get('content-type')||'multipart/form-data'
        }
      });
      const image=String(result?.image||'');
      if(!image)return json(502,{ok:false,error:'NOVEL2_AI_EDGE_EMPTY_IMAGE',model:AI_IMAGE_MODEL});
      return json(200,{ok:true,image,model:AI_IMAGE_MODEL});
    }catch(error){
      return json(502,{ok:false,error:'NOVEL2_AI_EDGE_IMAGE_FAILED',detail:String(error?.message||error).slice(0,220),model:AI_IMAGE_MODEL});
    }
  }

  return json(404,{ok:false,error:'NOVEL2_AI_EDGE_ROUTE_NOT_FOUND'});
}


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
    if(incoming.pathname.startsWith('/novel2-ai/'))return handleAi(request,env,incoming);
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
