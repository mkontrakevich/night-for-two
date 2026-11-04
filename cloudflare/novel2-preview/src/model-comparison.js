// Isolated, opt-in OpenRouter comparison endpoint. Authentication is performed
// by the enclosing Worker before this handler is called.
async function boundedJson(response,limit){
  if(!response.body)throw Error('EMPTY');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;if(length>limit)throw Error('TOO_LARGE');chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const joined=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
}

export async function modelComparison(request,env,send=fetch){
  const output=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
  let allowed;
  try{allowed=JSON.parse(String(env.NOVEL2_COMPARE_MODELS||'[]'));}catch{return output(503,{ok:false,error:'NOVEL2_COMPARE_NOT_CONFIGURED'});}
  if(!env.OPENROUTER_API_KEY||!Array.isArray(allowed)||allowed.length===0)return output(503,{ok:false,error:'NOVEL2_COMPARE_NOT_CONFIGURED'});
  let body;try{body=await boundedJson(request,70000);}catch{return output(400,{ok:false,error:'NOVEL2_COMPARE_INVALID_REQUEST'});}
  if(typeof body.model!=='string'||!allowed.includes(body.model)||!/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.:]+$/.test(body.model))return output(403,{ok:false,error:'NOVEL2_COMPARE_MODEL_DENIED'});
  if(typeof body.prompt!=='string'||!body.prompt.trim()||new TextEncoder().encode(body.prompt).length>64000)return output(400,{ok:false,error:'NOVEL2_COMPARE_INVALID_PROMPT'});
  try{
    const response=await send('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(100000),
      body:JSON.stringify({model:body.model,messages:[{role:'system',content:'Produce a useful frame description and a prompt for an image model. Follow the content policies of the model provider.'},{role:'user',content:body.prompt}],max_tokens:1600,provider:{allow_fallbacks:false}})
    });
    if(!response.ok)return output(response.status===429?429:502,{ok:false,error:'NOVEL2_COMPARE_PROVIDER_ERROR',provider_status:response.status});
    let result;try{result=await boundedJson(response,1000000);}catch{return output(502,{ok:false,error:'NOVEL2_COMPARE_RESPONSE_INVALID'});}
    const choice=result?.choices?.[0];
    if(choice?.message?.refusal||choice?.finish_reason==='content_filter')return output(200,{ok:true,refused:true,model:body.model});
    if(choice?.finish_reason==='length')return output(422,{ok:false,error:'NOVEL2_COMPARE_TRUNCATED'});
    if(typeof choice?.message?.content!=='string'||!choice.message.content.trim())return output(502,{ok:false,error:'NOVEL2_COMPARE_EMPTY'});
    return output(200,{ok:true,content:choice.message.content,model:result.model||body.model,usage:result.usage||null});
  }catch{return output(504,{ok:false,error:'NOVEL2_COMPARE_OUTCOME_UNCERTAIN'});}
}
