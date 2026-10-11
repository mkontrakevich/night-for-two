import crypto from 'node:crypto';
import sharp from 'sharp';
import {config} from './config.js';

function stripFence(value='') {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
}
function parseJson(raw='') {
  const source=stripFence(raw);
  try { return JSON.parse(source); }
  catch {
    const a=source.indexOf('{'), b=source.lastIndexOf('}');
    if(a>=0&&b>a){
      try{return JSON.parse(source.slice(a,b+1));}catch{}
    }
    throw new Error('NOVEL2_AI_JSON_INVALID');
  }
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function transientStatus(status){
  return [408,409,425,429,500,502,503,504].includes(Number(status));
}
function transientMessage(value=''){
  return /terminated|fetch failed|socket|ECONNRESET|ETIMEDOUT|UND_ERR|network|connection closed|other side closed|aborted|timeout/i.test(String(value||''));
}
async function requestJson(url,options,{attempts=3,timeoutMs=120000,label='NOVEL2_AI'}={}){
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(new Error(label+'_TIMEOUT')),timeoutMs);
    try{
      const response=await fetch(url,{...options,signal:controller.signal});
      const raw=await response.text();
      let json={};
      try{json=raw?JSON.parse(raw):{};}catch{json={error:{message:raw.slice(0,500)}};}
      if(response.ok)return{response,json};
      const message=String(
        typeof json?.error==='string'?json.error:
        json?.error?.message||json?.message||json?.detail||raw||'failed'
      );
      if(response.status===403&&/access denied by security policy|unsupported_country_region_territory/i.test(message)){
        throw new Error(label+'_PROVIDER_ACCESS_BLOCKED');
      }
      if(!transientStatus(response.status)||attempt===attempts)return{response,json};
      lastError=new Error(label+'_'+response.status+':'+message);
    }catch(error){
      lastError=error;
      if(String(error?.message||'').endsWith('_PROVIDER_ACCESS_BLOCKED'))throw error;
      // Keep the actual timeout distinct from transient transport failures.
      // User-visible actor job status relies on this distinction.
      if(controller.signal.aborted)throw new Error(label+'_TIMEOUT');
      if(attempt===attempts||!transientMessage(error?.message||error))throw new Error(label+'_TRANSPORT_FAILED');
    }finally{clearTimeout(timer);}
    await sleep(Math.min(4500,500*Math.pow(2,attempt-1)));
  }
  throw new Error(label+'_TRANSPORT_FAILED:'+String(lastError?.message||'failed').slice(0,160));
}

function edgeServiceKey(){
  if(!config.botToken)return'';
  return crypto.createHash('sha256').update('novel2-ai-v1:'+config.botToken).digest('hex');
}
async function edgeJson(route,body,{timeoutMs=180000,label='NOVEL2_EDGE_AI',attempts=2}={}){
  if(!config.edgeAiUrl)throw new Error('NOVEL2_EDGE_AI_URL_MISSING');
  const key=edgeServiceKey();
  if(!key)throw new Error('NOVEL2_EDGE_AI_AUTH_MISSING');
  const {response,json}=await requestJson(
    config.edgeAiUrl+'/'+String(route||'').replace(/^\/+/, ''),
    {
      method:'POST',
      headers:{'content-type':'application/json','x-novel2-service-key':key},
      body:JSON.stringify(body)
    },
    {attempts,timeoutMs,label}
  );
  if(!response.ok||json?.ok===false){
    // Streamed inference sends HTTP 200 heartbeats before it can know whether
    // the model will succeed. Handle its terminal JSON error explicitly.
    const detail=String(json?.detail||json?.error||json?.message||'failed').slice(0,220);
    throw new Error(label+'_'+(response.ok?502:response.status)+':'+detail);
  }
  return json;
}
function parseDataUrl(value=''){
  const m=String(value||'').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!m)return null;
  return{mime:m[1],buffer:Buffer.from(m[2],'base64')};
}
function inputReferenceUrl(value){
  if(typeof value==='string')return value;
  if(value&&typeof value==='object'){
    if(typeof value.image_url==='string')return value.image_url;
    if(typeof value.image_url?.url==='string')return value.image_url.url;
    if(typeof value.url==='string')return value.url;
  }
  return '';
}
async function resizeReference(value,maxPx=512){
  const parsed=parseDataUrl(inputReferenceUrl(value));
  if(!parsed)return'';
  try{
    const out=await sharp(parsed.buffer,{failOn:'warning',limitInputPixels:40_000_000})
      .rotate()
      .resize({width:maxPx,height:maxPx,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:86,mozjpeg:true})
      .toBuffer();
    return'data:image/jpeg;base64,'+out.toString('base64');
  }catch(error){
    throw new Error('NOVEL2_REFERENCE_RESIZE_FAILED:'+String(error?.message||error).slice(0,120));
  }
}
export async function resizeReferences(values=[],maxPx=512,limit=4){
  const out=[];
  for(const value of values.slice(0,limit)){
    const resized=await resizeReference(value,maxPx);
    if(resized)out.push(resized);
  }
  return out;
}

async function chat(payload) {
  // Single egress boundary: the Node origin may call AI only through Cloudflare.
  if(!config.edgeAiUrl)throw new Error('NOVEL2_CLOUDFLARE_AI_REQUIRED');
  const json=await edgeJson('text',{
    messages:payload.messages||[],
    temperature:payload.temperature,
    max_tokens:payload.max_tokens
  },{timeoutMs:Number(process.env.NOVEL2_AI_TIMEOUT_MS||120000),label:'NOVEL2_EDGE_TEXT'});
  return String(json?.content||'');
}

export async function textCompletion({system, user, temperature=.75, maxTokens=5000, model=config.textModel}) {
  return chat({
    model,
    temperature,
    max_tokens:maxTokens,
    messages:[
      {role:'system',content:system},
      {role:'user',content:typeof user === 'string' ? user : JSON.stringify(user)}
    ]
  });
}

export async function secretHostCompletion({system,user,temperature=.7,maxTokens=420}={}) {
  if(!config.edgeAiUrl)throw new Error('NOVEL2_CLOUDFLARE_AI_REQUIRED');
  const messages=[
    {role:'system',content:String(system||'').slice(0,14500)},
    {role:'user',content:JSON.stringify(user||{}).slice(0,2200)}
  ];
  const json=await edgeJson('host',{messages,temperature,max_tokens:maxTokens},
    {timeoutMs:35000,attempts:1,label:'NOVEL2_EDGE_HOST'});
  return {...parseJson(String(json?.content||'')),provider:String(json?.provider||'edge'),
    openrouter_failure:String(json?.openrouter_failure||'')};
}

export async function jsonCompletion(args) {
  const raw=await textCompletion(args);
  try{return parseJson(raw);}
  catch(error){
    if(error?.message!=='NOVEL2_AI_JSON_INVALID')throw error;
    const repaired=await textCompletion({
      system:'Ты восстанавливаешь повреждённый JSON. Верни только один валидный JSON-объект без markdown и пояснений. Сохрани исходные данные максимально точно; исправляй только синтаксис JSON.',
      user:{task:'Исправь синтаксис JSON.',broken_json:String(raw||'').slice(0,60000)},
      temperature:0,
      maxTokens:args?.maxTokens||5000,
      model:args?.model||config.textModel
    });
    return parseJson(repaired);
  }
}

export async function visionJsonCompletion({system,text,images=[],temperature=.1,maxTokens=2600}={}) {
  if(!config.edgeAiUrl)throw new Error('NOVEL2_CLOUDFLARE_AI_REQUIRED');
  const refs=await resizeReferences(images,1024,4);
  if(!refs.length)throw new Error('NOVEL2_VISION_REFERENCES_REQUIRED');
  const json=await edgeJson('vision',{
    system:String(system||''),
    text:String(text||''),
    images:refs,
    temperature,
    max_tokens:maxTokens
  },{timeoutMs:Number(process.env.NOVEL2_AI_TIMEOUT_MS||120000),label:'NOVEL2_EDGE_VISION'});
  return parseJson(String(json?.content||''));
}

export async function buildOpenRouterImagePayload({prompt,inputReferences=[],model=config.imageModel}={}){
  const payload={model,prompt:String(prompt||''),aspect_ratio:'9:16',output_format:'jpeg'};
  if(inputReferences.length){
    const prepared=await resizeReferences(inputReferences,768,4);
    if(prepared.length!==inputReferences.length)
      throw new Error('NOVEL2_IMAGE_REFERENCES_MISSING');
    payload.input_references=prepared.map(url=>({type:'image_url',image_url:{url}}));
  }
  if(model.includes('seedream'))payload.resolution='2K';
  return payload;
}

export async function imageCompletion({prompt,inputReferences=[],width=null,height=null,timeoutMs=null,provider='auto'}) {
  if(!config.edgeAiUrl)throw new Error('NOVEL2_CLOUDFLARE_AI_REQUIRED');
  if(provider==='openrouter')throw new Error('NOVEL2_DIRECT_OPENROUTER_FORBIDDEN');
  const refs=await resizeReferences(inputReferences,480,4);
  if(inputReferences.length&&!refs.length)throw new Error('NOVEL2_IMAGE_REFERENCES_MISSING');
  const json=await edgeJson('image',{
    prompt:String(prompt||''),
    input_references:refs,
    keepalive:provider==='edge-stream',
    width:Number(width||process.env.NOVEL2_EDGE_IMAGE_WIDTH||1024),
    height:Number(height||process.env.NOVEL2_EDGE_IMAGE_HEIGHT||1792)
  },{
    // One expensive inference for one explicit user job; no automatic image retries.
    attempts:1,
    timeoutMs:Math.min(180000,Number(timeoutMs||process.env.NOVEL2_IMAGE_TIMEOUT_MS||180000)),
    label:'NOVEL2_EDGE_IMAGE'
  });
  const base64=String(json?.image||'');
  if(!base64)throw new Error('NOVEL2_EDGE_IMAGE_EMPTY');
  return{base64,model:String(json?.model||'workers-ai')};
}

}
