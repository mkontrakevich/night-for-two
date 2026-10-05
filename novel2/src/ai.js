import {config} from './config.js';

function stripFence(value='') {
  return String(value || '').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
}
function parseJson(raw='') {
  try { return JSON.parse(stripFence(raw)); }
  catch {
    const a=String(raw).indexOf('{'), b=String(raw).lastIndexOf('}');
    if(a>=0&&b>a) return JSON.parse(String(raw).slice(a,b+1));
    throw new Error('NOVEL2_AI_JSON_INVALID');
  }
}
async function chat(payload) {
  if (!config.openRouterKey) throw new Error('NOVEL2_OPENROUTER_KEY_MISSING');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{
      authorization:`Bearer ${config.openRouterKey}`,
      'content-type':'application/json',
      'HTTP-Referer':'https://github.com/mkontrakevich/night-for-two',
      'X-Title':'Interactive Novel 2.0'
    },
    body:JSON.stringify(payload)
  });
  const json = await response.json();
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
  if (config.imageModel.includes('seedream')) payload.resolution='1K';
  const response=await fetch('https://openrouter.ai/api/v1/images',{
    method:'POST',
    headers:{
      authorization:`Bearer ${config.openRouterKey}`,
      'content-type':'application/json',
      'HTTP-Referer':'https://github.com/mkontrakevich/night-for-two',
      'X-Title':'Interactive Novel 2.0 Visuals'
    },
    body:JSON.stringify(payload)
  });
  const json=await response.json();
  if(!response.ok) throw new Error('NOVEL2_IMAGE_'+response.status+':'+String(json?.error?.message||'failed'));
  const first=json?.data?.[0];
  if(!first?.b64_json) throw new Error('NOVEL2_IMAGE_EMPTY');
  return {base64:first.b64_json,model:config.imageModel};
}
