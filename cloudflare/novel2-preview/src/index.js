import {WorkflowEntrypoint} from 'cloudflare:workers';
import {handleStranger,runStrangerWorld} from './stranger.js';
import {handleNativeActor,runNativeActor} from './native-actor.js';
import {handleMigrationAdmin,runLegacyMigration} from './migrate-legacy.js';
import {ACTOR_VIEW_SPEC,actorViewPrompt,bytesFromAiImage,base64FromBytes,compositeActorSvg} from './actor-sheet-compose.js';

export class ActorSheetWorkflow extends WorkflowEntrypoint {
 async run(event,step){
  if(event?.payload?.cloud_guest)return runNativeActor(this.env,event.payload,step);
  const role=String(event?.payload?.role||'');
  const jobId=String(event?.payload?.job_id||'');
  if(!['A','B'].includes(role)||!/^[a-f0-9-]{36}$/i.test(jobId))return{status:'invalid'};
  const env=this.env;
  if(!env.NOVEL2_THEATRE||!env.AI?.run)return{status:'cloudflare_bindings_missing'};
  const origin='http://'+env.NOVEL2_ORIGIN_HOST+':'+(env.NOVEL2_ORIGIN_PORT||'5690');
  const key=String(env.NOVEL2_SERVICE_SECRET||'');
  const call=async(route,payload)=>{
    const res=await env.NOVEL2_VPC.fetch(new Request(origin+route,{
      method:'POST',headers:{'content-type':'application/json','x-novel2-service-key':key},
      body:JSON.stringify(payload)
    }));
    const body=await res.json();
    if(!res.ok||!body?.ok)throw new Error('NOVEL2_ACTOR_CALLBACK_'+res.status);
    return body;
  };
  const stagedKey='stranger/actor-jobs/'+role+'/'+jobId+'.svg';
  const panels=[];
  // Four isolated jobs. A panel's R2 checkpoint is committed in its own
  // durable step; retrying the callback never causes any new inference.
  try{
   for(const view of ACTOR_VIEW_SPEC){
    const staged=await step.do('render isolated '+view.key,{
      retries:{limit:0,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'
    },async()=>{
      const prepared=await call('/novel2/api/identity/calibrate/work',{role,job_id:jobId});
      const work=prepared.work||{},refs=Array.isArray(work.refs)?work.refs.slice(0,3):[];
      if(!refs.length)throw new Error('NOVEL2_ACTOR_NO_REFERENCES');
      const basePrompt=String(work.prompt||'').slice(0,16000);
      if(!basePrompt)throw new Error('NOVEL2_ACTOR_NO_PROMPT');
      const prompt=actorViewPrompt({view,role,identityLock:basePrompt});
      const form=new FormData();
      form.append('prompt',prompt);
      form.append('width',String(view.width));
      form.append('height',String(view.height));
      for(let i=0;i<refs.length;i++){
        const blob=dataUrlBlob(refs[i]);
        if(!blob)throw new Error('NOVEL2_ACTOR_REFERENCE_INVALID');
        form.append('input_image_'+i,blob,'reference-'+i+'.jpg');
      }
      const encoded=new Response(form);
      const inference=await env.AI.run(AI_IMAGE_MODEL,{multipart:{
        body:encoded.body,contentType:encoded.headers.get('content-type')||'multipart/form-data'
      }});
      const bytes=bytesFromAiImage(inference?.image);
      if(!bytes)throw Error('NOVEL2_ACTOR_PANEL_MALFORMED_'+view.key);
      const panelKey='stranger/actor-jobs/'+role+'/'+jobId+'/'+view.key+'.jpg';
      await env.NOVEL2_THEATRE.put(panelKey,bytes,{
        httpMetadata:{contentType:'image/jpeg'},
        customMetadata:{kind:'isolated-actor-view',job_id:jobId,role,view:view.key}
      });
      return{key:panelKey,view:view.key};
    });
    panels.push(staged);
   }
   await step.do('assemble four clipped views without AI',{
     retries:{limit:5,delay:'5 seconds',backoff:'exponential'},timeout:'2 minutes'
   },async()=>{
    const sources=[];
    for(let i=0;i<ACTOR_VIEW_SPEC.length;i++){
     const obj=await env.NOVEL2_THEATRE.get(panels[i].key);
     if(!obj||obj.size<100||obj.size>10_000_000)throw Error('NOVEL2_ACTOR_PANEL_LOST');
     sources.push({key:ACTOR_VIEW_SPEC[i].key,bytes:new Uint8Array(await obj.arrayBuffer())});
    }
    const svg=compositeActorSvg(sources);
    const blob=new TextEncoder().encode(svg);
    if(blob.length>15_000_000)throw Error('NOVEL2_ACTOR_SHEET_TOO_LARGE');
    await env.NOVEL2_THEATRE.put(stagedKey,blob,{
      httpMetadata:{contentType:'image/svg+xml'},
      customMetadata:{kind:'composed-actor-sheet',job_id:jobId,role}
    });
    return{key:stagedKey};
   });
  }catch(error){
   try{await call('/novel2/api/identity/calibrate/complete',
    {role,job_id:jobId,status:'failed'});}catch{}
   console.error('NOVEL2_ACTOR_GENERATION_FAILED',{kind:'isolated_panel_or_composition'});
   return{status:'failed'};
  }
  try{
    return await step.do('sync isolated actor sheet to canonical identity store',{
      retries:{limit:9,delay:'20 seconds',backoff:'exponential'},timeout:'3 minutes'
    },async()=>{
      const object=await env.NOVEL2_THEATRE.get(stagedKey);
      if(!object||object.size<1000||object.size>15_000_000)
        throw Error('NOVEL2_ACTOR_STAGED_RESULT_MISSING');
      const bytes=new Uint8Array(await object.arrayBuffer());
      await call('/novel2/api/identity/calibrate/complete',{
        role,job_id:jobId,status:'ready',image:base64FromBytes(bytes),
        model:AI_IMAGE_MODEL,prompt:'Four independently generated isolated actor views; deterministic SVG 2x2 composition'
      });
      try{
        await env.NOVEL2_THEATRE.delete(stagedKey);
        for(const p of panels)await env.NOVEL2_THEATRE.delete(p.key);
      }catch{}
      return{status:'ready'};
    });
  }catch{
    console.warn('NOVEL2_ACTOR_SYNC_PENDING',{code:'ORIGIN_UNAVAILABLE'});
    return{status:'sync_pending'};
  }
 }
}

export class LegacyMigrationWorkflow extends WorkflowEntrypoint {
  async run(event,step){return runLegacyMigration(this.env,event.payload,step)}
}

export class PurgatoryWorldWorkflow extends WorkflowEntrypoint {
  async run(event,step){
    if(event?.payload?.user_id)return runStrangerWorld(this.env,event.payload,step,AI_IMAGE_MODEL);
    const role=String(event?.payload?.role||''),jobId=String(event?.payload?.job_id||'');
    if(!['A','B'].includes(role)||!jobId)return{status:'invalid'};
    return await step.do('render and persist guest-inspired theatre', {
      retries:{limit:0,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'
    },async()=>{
      const env=this.env,origin='http://'+env.NOVEL2_ORIGIN_HOST+':'+(env.NOVEL2_ORIGIN_PORT||'5690');
      const key=String(env.NOVEL2_SERVICE_SECRET||'');
      const call=async(route,payload)=>{
        const result=await env.NOVEL2_VPC.fetch(new Request(origin+route,{
          method:'POST',headers:{'content-type':'application/json','x-novel2-service-key':key},
          body:JSON.stringify(payload)
        }));
        const body=await result.json();
        if(!result.ok||!body?.ok)throw new Error('NOVEL2_LOBBY_VPC_'+result.status);
        return body;
      };
      let ready=false;
      try{
        const prepared=await call('/novel2/api/lobby/world/work',{role,job_id:jobId});
        const prompt=String(prepared.work?.prompt||'');
        if(prompt.length<100)throw new Error('NOVEL2_LOBBY_PROMPT_EMPTY');
        const form=new FormData();
        form.append('prompt',prompt);form.append('width','832');form.append('height','1344');
        const encoded=new Response(form);
        const ai=await env.AI.run(AI_IMAGE_MODEL,{multipart:{
          body:encoded.body,contentType:encoded.headers.get('content-type')||'multipart/form-data'
        }});
        const image=String(ai?.image||'');
        if(image.length<1500)throw new Error('NOVEL2_LOBBY_IMAGE_EMPTY');
        const result={role,job_id:jobId,status:'ready',image,model:AI_IMAGE_MODEL};
        // The chargeable AI inference is NEVER repeated on callback failure.
        for(let attempt=0;attempt<4;attempt++){
          try{await call('/novel2/api/lobby/world/complete',result);ready=true;break}
          catch(error){if(attempt===3)throw error;await new Promise(r=>setTimeout(r,600*(attempt+1)))}
        }
        return{status:ready?'ready':'failed'};
      }catch(error){
        if(!ready){
          try{await call('/novel2/api/lobby/world/complete',
            {role,job_id:jobId,status:'failed',error_code:'GENERATION_FAILED'})}catch{}
        }
        console.error('NOVEL2_LOBBY_WORKFLOW_FAILED',String(error?.message||'failed').slice(0,80));
        return{status:'failed'};
      }
    });
  }
}

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


  if(incoming.pathname==='/novel2-ai/host'){
    let body={};
    try{body=await request.json()}catch{return json(400,{ok:false,error:'NOVEL2_HOST_JSON_REQUIRED'})}
    const messages=Array.isArray(body.messages)?body.messages.slice(0,2).map(x=>({
      role:x?.role==='system'?'system':'user',content:String(x?.content||'').slice(0,15000)
    })):[];
    if(messages.length!==2||messages[0].role!=='system'||messages[1].role!=='user')
      return json(400,{ok:false,error:'NOVEL2_HOST_MESSAGES_INVALID'});
    const maxTokens=Math.max(128,Math.min(600,Number(body.max_tokens)||420));
    const temperature=Math.max(0,Math.min(1,Number(body.temperature)||.7));
    // Secret lives only in the Cloudflare runtime. No browser-origin requests
    // can invoke this endpoint, and no photos are ever sent to the narrator.
    let openrouterFailure=env.OPENROUTER_API_KEY?'unknown':'key_not_configured';
    if(env.OPENROUTER_API_KEY){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),21000);
      try{
        const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
          method:'POST',signal:controller.signal,
          headers:{'Authorization':'Bearer '+String(env.OPENROUTER_API_KEY),
            'Content-Type':'application/json',
            'HTTP-Referer':'https://novel2-preview.kontrakevich.workers.dev',
            'X-Title':'Novel2 Secret Host'},
          body:JSON.stringify({
            model:String(env.OPENROUTER_HOST_MODEL||'openai/gpt-4.1-mini'),
            messages,temperature,max_tokens:maxTokens,
            response_format:{type:'json_object'}
          })
        });
        if(response.ok){
          const result=await response.json();
          const content=String(result?.choices?.[0]?.message?.content||'');
          if(content.length>2&&content.length<3500)
            return json(200,{ok:true,content,provider:'openrouter'});
        }else {openrouterFailure='http_'+response.status;console.warn('NOVEL2_HOST_OPENROUTER_UNAVAILABLE',{status:response.status});}
      }catch(error){openrouterFailure=controller.signal.aborted?'timeout':'transport';console.warn('NOVEL2_HOST_OPENROUTER_UNAVAILABLE',{kind:openrouterFailure})}
      finally{clearTimeout(timer)}
    }
    // Prologue must continue when the regional OpenRouter route is blocked.
    try{
      const result=await env.AI.run(AI_TEXT_MODEL,{
        messages,temperature,max_tokens:maxTokens,
        response_format:{type:'json_object'}
      });
      const content=workerTextContent(result);
      if(content.length>2)return json(200,{ok:true,content,provider:'workers-ai',openrouter_failure:openrouterFailure});
      return json(502,{ok:false,error:'NOVEL2_HOST_EMPTY_REPLY'});
    }catch(error){
      return json(502,{ok:false,error:'NOVEL2_HOST_MODEL_FAILED'});
    }
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
    // Never silently turn image-to-image into an unrelated text-to-image
    // generation. The origin has already resized every reference <512px.
    if(refs.length&&refIndex!==refs.length){
      return json(422,{ok:false,error:'NOVEL2_AI_EDGE_REFERENCE_INVALID',accepted:refIndex,expected:refs.length});
    }
    const encoded=new Response(form);
    const infer=async()=>{
      const result=await env.AI.run(AI_IMAGE_MODEL,{
        multipart:{
          body:encoded.body,
          contentType:encoded.headers.get('content-type')||'multipart/form-data'
        }
      });
      const image=String(result?.image||'');
      if(!image)throw new Error('NOVEL2_AI_EDGE_EMPTY_IMAGE');
      return{ok:true,image,model:AI_IMAGE_MODEL};
    };
    if(body.keepalive===true){
      // Edge-to-origin image generation previously terminated idle connections
      // after ~22s. Heartbeat whitespace is legal before a JSON document and
      // keeps the HTTP body active while AI inference executes. No second render.
      const encoder=new TextEncoder();
      const stream=new ReadableStream({
        start(controller){
          let finished=false;
          const heartbeat=()=>{
            if(finished)return;
            try{controller.enqueue(encoder.encode(' '.repeat(2048)))}catch{}
          };
          heartbeat();
          const timer=setInterval(heartbeat,4000);
          (async()=>{
            try{
              const result=await infer();
              if(!finished)controller.enqueue(encoder.encode(JSON.stringify(result)));
            }catch(error){
              const result={ok:false,error:'NOVEL2_AI_EDGE_IMAGE_FAILED',model:AI_IMAGE_MODEL};
              try{if(!finished)controller.enqueue(encoder.encode(JSON.stringify(result)))}catch{}
            }finally{
              finished=true;clearInterval(timer);
              try{controller.close()}catch{}
            }
          })();
        }
      });
      return new Response(stream,{status:200,headers:{
        'content-type':'application/json; charset=utf-8',
        'cache-control':'no-store','x-novel2-image-keepalive':'1',
        'x-accel-buffering':'no'
      }});
    }
    try{
      const result=await infer();
      return json(200,result);
    }catch(error){
      return json(502,{ok:false,error:'NOVEL2_AI_EDGE_IMAGE_FAILED',
        detail:String(error?.message||error).slice(0,220),model:AI_IMAGE_MODEL});
    }
  }

  return json(404,{ok:false,error:'NOVEL2_AI_EDGE_ROUTE_NOT_FOUND'});
}


function buildUpstream(target,request,incoming,attempt,smallBody=null){
  let upstream;
  if(smallBody===null){
    upstream=new Request(target.toString(),request);
  }else{
    const headers=new Headers(request.headers);
    headers.delete('content-length');
    headers.delete('transfer-encoding');
    upstream=new Request(target.toString(),{
      method:request.method,headers,
      // Known-size immutable bytes avoid indefinite streamed POST bodies
      // across the beta VPC Network binding.
      body:new TextEncoder().encode(smallBody)
    });
  }
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


async function beginLobbyWorldAtEdge(request,env,host,port){
  if(!env.NOVEL2_SERVICE_SECRET||!env.LOBBY_WORLD_WORKFLOW)
    return json(503,{ok:false,error:'NOVEL2_LOBBY_WORLD_WORKFLOW_MISSING'});
  const body=await request.clone().text();
  if(body.length>2000)return json(413,{ok:false,error:'NOVEL2_LOBBY_PLACE_TOO_LONG'});
  let parsed={};try{parsed=JSON.parse(body||'{}')}catch{
    return json(400,{ok:false,error:'NOVEL2_LOBBY_JSON_INVALID'});
  }
  if(typeof parsed.place!=='string'||parsed.place.length>120||parsed.place.length<2)
    return json(400,{ok:false,error:'NOVEL2_LOBBY_PLACE_INVALID'});
  const target='http://'+host+':'+port+'/novel2/api/lobby/world/';
  let prepared;
  try{
    const response=await env.NOVEL2_VPC.fetch(new Request(target+'prepare',{
      method:'POST',headers:{
        'content-type':'application/json','x-novel2-service-key':String(env.NOVEL2_SERVICE_SECRET),
        'x-telegram-init-data':request.headers.get('x-telegram-init-data')||''
      },body
    }));
    prepared=await response.json();
    if(!response.ok||!prepared?.ok)
      return json(response.status,{ok:false,error:String(prepared?.error||'NOVEL2_LOBBY_PREPARE_FAILED')});
  }catch{return json(502,{ok:false,error:'NOVEL2_LOBBY_PREPARE_UNAVAILABLE'})}
  const work=prepared.work;
  if(!work)return json(200,{ok:true,world:prepared.state});
  try{
    await env.LOBBY_WORLD_WORKFLOW.create({
      id:String(work.job_id),params:{role:String(work.role),job_id:String(work.job_id)}
    });
    return json(200,{ok:true,world:prepared.state});
  }catch{
    try{await env.NOVEL2_VPC.fetch(new Request(target+'complete',{
      method:'POST',headers:{'content-type':'application/json',
        'x-novel2-service-key':String(env.NOVEL2_SERVICE_SECRET)},
      body:JSON.stringify({role:work.role,job_id:work.job_id,status:'failed',
        error_code:'GENERATION_WORKFLOW_START_FAILED'})
    }))}catch{}
    return json(503,{ok:false,error:'NOVEL2_LOBBY_WORKFLOW_START_FAILED'});
  }
}

async function beginActorSheetAtEdge(request,env,host,port){
  if(!env.NOVEL2_SERVICE_SECRET)
    return json(503,{ok:false,error:'NOVEL2_ACTOR_EDGE_SECRET_MISSING'});
  const origin='http://'+host+':'+port+'/novel2/api/identity/calibrate/';
  const body=await request.clone().text();
  if(body.length>10000)return json(413,{ok:false,error:'NOVEL2_ACTOR_START_BODY_TOO_LARGE'});
  const prepare=new Request(origin+'prepare',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-novel2-service-key':String(env.NOVEL2_SERVICE_SECRET),
      'x-telegram-init-data':request.headers.get('x-telegram-init-data')||''
    },
    body:body||'{}'
  });
  let prepared;
  try{
    const result=await env.NOVEL2_VPC.fetch(prepare);
    prepared=await result.json();
    if(!result.ok||!prepared?.ok)
      return json(result.status,{ok:false,error:String(prepared?.error||'NOVEL2_ACTOR_PREPARE_FAILED').slice(0,100)});
  }catch(error){return json(502,{ok:false,error:'NOVEL2_ACTOR_PREPARE_TRANSPORT_FAILED'});}
  const work=prepared.work;
  if(!work)return json(200,{ok:true,job:prepared.job});
  if(env.ACTOR_SHEET_WORKFLOW){
    try{
      await env.ACTOR_SHEET_WORKFLOW.create({
        id:String(work.job_id),params:{role:String(work.role),job_id:String(work.job_id)}
      });
      // No long-lived browser or Windows HTTP connection. Status is polled
      // from the origin after durable Cloudflare execution and persistence.
      return json(200,{ok:true,job:prepared.job});
    }catch(error){
      try{
        await env.NOVEL2_VPC.fetch(new Request(origin+'complete',{
          method:'POST',headers:{'content-type':'application/json',
            'x-novel2-service-key':String(env.NOVEL2_SERVICE_SECRET)},
          body:JSON.stringify({role:work.role,job_id:work.job_id,status:'failed'})
        }));
      }catch{}
      return json(503,{ok:false,error:'NOVEL2_ACTOR_WORKFLOW_START_FAILED'});
    }
  }
  const submitResult=async(payload)=>{
    const response=await env.NOVEL2_VPC.fetch(new Request(origin+'complete',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-novel2-service-key':String(env.NOVEL2_SERVICE_SECRET)
      },
      body:JSON.stringify({job_id:work.job_id,role:work.role,...payload})
    }));
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error('NOVEL2_ACTOR_RESULT_PERSIST_FAILED');
    return data.job;
  };
  const inferAndCommit=async()=>{
    const form=new FormData();
    form.append('prompt',String(work.prompt||''));
    form.append('width',String(work.width||832));
    form.append('height',String(work.height||1344));
    let n=0;
    for(const ref of (Array.isArray(work.refs)?work.refs:[]).slice(0,4)){
      const blob=dataUrlBlob(ref);
      if(!blob)throw new Error('NOVEL2_ACTOR_EDGE_REFERENCE_INVALID');
      form.append('input_image_'+n,blob,'reference-'+n+'.jpg');n++;
    }
    if(!n)throw new Error('NOVEL2_ACTOR_EDGE_REFERENCES_MISSING');
    const encoded=new Response(form);
    try{
      const result=await env.AI.run(AI_IMAGE_MODEL,{
        multipart:{
          body:encoded.body,
          contentType:encoded.headers.get('content-type')||'multipart/form-data'
        }
      });
      const image=String(result?.image||'');
      if(!image)throw new Error('NOVEL2_ACTOR_EDGE_EMPTY_IMAGE');
      const job=await submitResult({
        status:'ready',image,model:AI_IMAGE_MODEL,prompt:String(work.prompt||'')
      });
      return{ok:true,job};
    }catch(error){
      try{await submitResult({status:'failed'})}catch{}
      return{ok:false,error:'NOVEL2_ACTOR_EDGE_GENERATION_FAILED'};
    }
  };
  // Only the browser/Cloudflare request remains open during inference.
  // The Windows origin receives one short VPC completion callback, rather
  // than an outgoing long-lived request to the public image endpoint.
  const stream=new ReadableStream({
    start(controller){
      const encoder=new TextEncoder();
      let complete=false;
      const pulse=()=>{
        if(complete)return;
        try{controller.enqueue(encoder.encode(' '.repeat(2048)))}catch{}
      };
      pulse();
      const timer=setInterval(pulse,4000);
      (async()=>{
        try{
          const result=await inferAndCommit();
          if(!complete)controller.enqueue(encoder.encode(JSON.stringify(result)));
        }catch(error){
          try{if(!complete)controller.enqueue(encoder.encode(JSON.stringify({ok:false,error:'NOVEL2_ACTOR_EDGE_UNAVAILABLE'})))}catch{}
        }finally{
          complete=true;clearInterval(timer);
          try{controller.close()}catch{}
        }
      })();
    }
  });
  return new Response(stream,{status:200,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-novel2-actor-engine':'cloudflare-vpc'
  }});
}

export default{
  async fetch(request,env){
    const incoming=new URL(request.url);
    if(incoming.pathname==='/') return Response.redirect(new URL('/novel2/',incoming).toString(),302);
    if(incoming.pathname.startsWith('/novel2-ai/migration/')){
      const authorized=await aiAuthorized(request,env);
      return await handleMigrationAdmin(request,env,incoming,authorized);
    }
    if(incoming.pathname.startsWith('/novel2/api/cloud/actor/'))
      return await handleNativeActor(request,env,incoming);
    if(incoming.pathname.startsWith('/novel2-ai/'))return handleAi(request,env,incoming);
    // Native Cloudflare prologue. Existing casting/story API remains behind VPC until migrated.
    const stranger=await handleStranger(request,env,incoming);
    if(stranger)return stranger;
    // Static Mini App delivery is independent from the Windows VPC origin.
    // Dynamic authenticated APIs remain on the private origin.
    if(request.method==='GET'&&env.ASSETS&&typeof env.ASSETS.fetch==='function'){
      const uiPath=incoming.pathname==='/novel2'||incoming.pathname==='/novel2/'
        ?'/index.html'
        :['/noir-experience.js','/noir-experience.css','/noir-host.js','/noir-host.css']
            .find(p=>incoming.pathname==='/novel2'+p);
      if(uiPath){
        const assetUrl=new URL(uiPath,incoming);
        const assetResponse=await env.ASSETS.fetch(new Request(assetUrl.toString(),{method:'GET'}));
        if(assetResponse.ok){
          const headers=new Headers(assetResponse.headers);
          headers.set('cache-control','no-store');
          headers.set('x-novel2-preview','1');
          headers.set('x-novel2-static-delivery','assets');
          return new Response(assetResponse.body,{status:assetResponse.status,headers});
        }
      }
    }
    if(!(incoming.pathname==='/novel2'||incoming.pathname.startsWith('/novel2/'))){
      return json(404,{ok:false,error:'NOVEL2_ROUTE_NOT_FOUND'});
    }
    if(!env.NOVEL2_VPC||typeof env.NOVEL2_VPC.fetch!=='function') return json(503,{ok:false,error:'NOVEL2_VPC_BINDING_MISSING'});
    const host=env.NOVEL2_ORIGIN_HOST,port=env.NOVEL2_ORIGIN_PORT||'5690';
    if(!host) return json(503,{ok:false,error:'NOVEL2_ORIGIN_HOST_MISSING'});
    if(request.method==='POST'&&incoming.pathname==='/novel2/api/lobby/world/start')
      return beginLobbyWorldAtEdge(request,env,host,port);
    if(request.method==='POST'&&incoming.pathname==='/novel2/api/identity/calibrate/start')
      return beginActorSheetAtEdge(request,env,host,port);

    const target=new URL(incoming.pathname+incoming.search,`http://${host}:${port}`);
    // Document pages are small. Buffer them at the edge so VPC streaming and
    // inherited Content-Length headers cannot leave the client waiting forever.
    // API calls (including long-running AI operations) retain streaming behavior.
    const isDocument=(request.method==='GET')&&(incoming.pathname==='/novel2'||incoming.pathname==='/novel2/');
    const isSmallApi=(request.method==='POST')&&[
      '/novel2/api/state',
      '/novel2/api/identity/calibrate/start',
      '/novel2/api/identity/calibrate/status',
      '/novel2/api/lobby/world/status',
      '/novel2/api/books'
    ].includes(incoming.pathname);
    const smallBody=isSmallApi?await request.clone().text():null;
    if(isSmallApi&&new TextEncoder().encode(smallBody).byteLength>16384){
      return json(413,{ok:false,error:'NOVEL2_EDGE_SMALL_API_BODY_TOO_LARGE'});
    }

    // Clone the request before retries so POST bodies remain replayable.
    const sources=[];
    for(let i=0;i<5;i++) sources.push(request.clone());

    const retryDelays=[250,600,1200,2200];
    let lastError=null;
    for(let attempt=1;attempt<=sources.length;attempt++){
      try{
        const response=await env.NOVEL2_VPC.fetch(buildUpstream(target,sources[attempt-1],incoming,attempt,smallBody));
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        headers.set('x-novel2-preview','1');
        if(attempt>1)headers.set('x-novel2-edge-retry',String(attempt-1));
        if((isDocument||isSmallApi)&&response.ok){
          const content=await response.arrayBuffer();
          const maxBytes=isDocument?2_000_000:16_000_000;
          if(!content.byteLength||content.byteLength>maxBytes)throw new Error('NOVEL2_EDGE_RESPONSE_INVALID_SIZE');
          headers.delete('content-length');
          headers.delete('transfer-encoding');
          headers.set('content-length',String(content.byteLength));
          headers.set('x-novel2-document-delivery','buffered');
          return new Response(content,{status:response.status,statusText:response.statusText,headers});
        }
        return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
      }catch(error){
        lastError=error;
        if(attempt<sources.length)await sleep(retryDelays[attempt-1]||2200);
      }
    }

    // Never expose raw transport JSON as the whole Telegram Mini App page.
    // Keep a lightweight self-healing shell on document navigation while the
    // tunnel reconnects; API/health calls still receive structured JSON.
    if(isDocument)return recoveryPage();

    return json(502,{
      ok:false,
      error:'NOVEL2_ORIGIN_UNREACHABLE',
      retryable:true,
      detail:String(lastError?.message||lastError||'origin unavailable').slice(0,160)
    },{'retry-after':'2'});
  }
};
