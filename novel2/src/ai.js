import {config} from './config.js';

function stripFence(value='') {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
}
function parseJson(raw='') {
  try { return JSON.parse(stripFence(raw)); }
  catch {
    const a=String(raw).indexOf('{'), b=String(raw).lastIndexOf('}');
    if(a>=0&&b>a) return JSON.parse(String(raw).slice(a,b+1));
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
      const message=String(json?.error?.message||raw||'failed');
      if(!transientStatus(response.status)||attempt===attempts){
        return{response,json};
      }
      lastError=new Error(label+'_'+response.status+':'+message);
    }catch(error){
      lastError=error;
      if(attempt===attempts||!transientMessage(error?.message||error))throw new Error(label+'_TRANSPORT_FAILED');
    }finally{
      clearTimeout(timer);
    }
    await sleep(Math.min(4500,500*Math.pow(2,attempt-1)));
  }
  throw new Error(label+'_TRANSPORT_FAILED:'+String(lastError?.message||'failed').slice(0,160));
}

async function chat(payload) {
  if (!config.openRouterKey) throw new Error('NOVEL2_OPENROUTER_KEY_MISSING');
  const {response,json}=await requestJson(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method:'POST',
      headers:{
        authorization:`Bearer ${config.openRouterKey}`,
        'content-type':'application/json',
        'HTTP-Referer':'https://github.com/mkontrakevich/night-for-two',
        'X-Title':'Interactive Novel 2.0'
      },
      body:JSON.stringify(payload)
    },
    {
      attempts:Number(process.env.NOVEL2_AI_RETRIES||3),
      timeoutMs:Number(process.env.NOVEL2_AI_TIMEOUT_MS||120000),
      label:'NOVEL2_AI'
    }
  );
  if (!response.ok) throw new Error('NOVEL2_AI_'+response.status+':'+String(json?.error?.message||'failed'));
  return String(json?.choices?.[0]?.message?.content || '');
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

export async function jsonCompletion(args) {
  return parseJson(await textCompletion(args));
}

export async function visionJsonCompletion({system,text,images=[],temperature=.1,maxTokens=2600,model=config.visionModel}) {
  const content=[{type:'text',text:String(text||'')}];
  for(const image of images.slice(0,6)){
    const url=String(image||'');
    if(url) content.push({type:'image_url',image_url:{url}});
  }
  const raw=await chat({
    model,
    temperature,
    max_tokens:maxTokens,
    messages:[{role:'system',content:system},{role:'user',content}]
  });
  return parseJson(raw);
}

export async function imageCompletion({prompt,inputReferences=[]}) {
  if (!config.openRouterKey) throw new Error('NOVEL2_OPENROUTER_KEY_MISSING');
  const payload={model:config.imageModel,prompt,aspect_ratio:'9:16',output_format:'jpeg'};
  if (inputReferences.length) payload.input_references = inputReferences;

  if (config.imageModel.includes('seedream')) {
    payload.resolution=process.env.NOVEL2_IMAGE_RESOLUTION||'2K';
  }

  const requestImage=async body=>requestJson(
    'https://openrouter.ai/api/v1/images',
    {
      method:'POST',
      headers:{
        authorization:`Bearer ${config.openRouterKey}`,
        'content-type':'application/json',
        'HTTP-Referer':'https://github.com/mkontrakevich/night-for-two',
        'X-Title':'Interactive Novel 2.0 Visuals'
      },
      body:JSON.stringify(body)
    },
    {
      attempts:Number(process.env.NOVEL2_IMAGE_RETRIES||3),
      timeoutMs:Number(process.env.NOVEL2_IMAGE_TIMEOUT_MS||240000),
      label:'NOVEL2_IMAGE'
    }
  );

  let {response,json}=await requestImage(payload);
  const message=String(json?.error?.message||'');
  if(
    !response.ok &&
    config.imageModel.includes('seedream') &&
    payload.resolution &&
    /output pixels|larger resolution|minimum/i.test(message)
  ){
    const retryPayload={...payload};
    delete retryPayload.resolution;
    ({response,json}=await requestImage(retryPayload));
  }

  if(!response.ok) throw new Error('NOVEL2_IMAGE_'+response.status+':'+String(json?.error?.message||'failed'));
  const first=json?.data?.[0];
  if(!first?.b64_json) throw new Error('NOVEL2_IMAGE_EMPTY');
  return {base64:first.b64_json,model:config.imageModel};
}
