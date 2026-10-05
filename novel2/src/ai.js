import {config} from './config.js';

function stripFence(value='') {
  return String(value || '').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
}

export async function textCompletion({system, user, temperature=.75, maxTokens=5000, model=config.textModel}) {
  if (!config.openRouterKey) throw new Error('NOVEL2_OPENROUTER_KEY_MISSING');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{
      authorization:`Bearer ${config.openRouterKey}`,
      'content-type':'application/json',
      'HTTP-Referer':'https://github.com/mkontrakevich/night-for-two',
      'X-Title':'Interactive Novel 2.0'
    },
    body:JSON.stringify({
      model,
      temperature,
      max_tokens:maxTokens,
      messages:[{role:'system',content:system},{role:'user',content:typeof user === 'string' ? user : JSON.stringify(user)}]
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error('NOVEL2_AI_'+response.status+':'+String(json?.error?.message||'failed'));
  return String(json?.choices?.[0]?.message?.content || '');
}

export async function jsonCompletion(args) {
  const raw = await textCompletion(args);
  try { return JSON.parse(stripFence(raw)); }
  catch {
    const a=raw.indexOf('{'), b=raw.lastIndexOf('}');
    if(a>=0&&b>a) return JSON.parse(raw.slice(a,b+1));
    throw new Error('NOVEL2_AI_JSON_INVALID');
  }
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
