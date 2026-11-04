// OpenRouter text comparison; identical params/prompt for all model attempts.
async function boundedJson(response,limit){
 if(!response.body)throw Error('EMPTY');const reader=response.body.getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw Error('TOO_LARGE');chunks.push(value)}}finally{reader.releaseLock()}
 const joined=new Uint8Array(length);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
}
export async function modelComparison(request,env,send=fetch){
 const output=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
 let allowed;try{allowed=JSON.parse(String(env.NOVEL2_COMPARE_MODELS||'[]'))}catch{return output(503,{ok:false,error:'NOVEL2_COMPARE_NOT_CONFIGURED'})}
 if(!env.OPENROUTER_API_KEY||!Array.isArray(allowed)||allowed.length===0)return output(503,{ok:false,error:'NOVEL2_COMPARE_NOT_CONFIGURED'});
 let body;try{body=await boundedJson(request,220000)}catch{return output(400,{ok:false,error:'NOVEL2_COMPARE_INVALID_REQUEST'})}
 if(typeof body.model!=='string'||!allowed.includes(body.model)||!/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.:]+$/.test(body.model))return output(403,{ok:false,error:'NOVEL2_COMPARE_MODEL_DENIED'});
 if(typeof body.prompt!=='string'||!body.prompt.trim()||new TextEncoder().encode(body.prompt).length>205000)return output(400,{ok:false,error:'NOVEL2_COMPARE_INVALID_PROMPT'});
 if(body.temperature!==0.5||body.max_tokens!==1800)return output(400,{ok:false,error:'NOVEL2_COMPARE_PARAMS_INVALID'});

 if(env.MODEL_TESTS_FIXTURE_MODE==='1'){
   // Only an isolated staging Worker explicitly enables this simulation.
   const result={frame_title:'STAGING FIXTURE',scene_summary:'Двое вымышленных взрослых у окна; синтетический ответ',shot_type:'medium shot',camera_angle:'eye level',lens_mm:50,blocking:{person_a:'слева у окна',person_b:'справа',hands:'на столе',gaze:'в окно',scale:'medium'},wardrobe_props:'пальто',environment:'приморский отель',lighting:'мягкий свет справа',palette:'латунь и серый',emotion:'сдержанная близость',sensory_details:'бархат и туман',final_image_prompt:'STAGING FIXTURE ONLY: medium shot of two fictional adults by a hotel window, natural perspective, soft evening light',negative_prompt:'extra fingers, distorted anatomy'};
   return output(200,{ok:true,content:JSON.stringify(result),model:body.model,usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0,cost:0},simulation:true});
 }

 try{
  const response=await send('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.OPENROUTER_API_KEY},signal:AbortSignal.timeout(100000),
   body:JSON.stringify({model:body.model,messages:[{role:'system',content:'Produce exactly one valid JSON object containing a camera-ready cinematic frame description and an image-generation prompt. Follow the supplied scene and documents without introducing unsupported details. All characters are adults; comply with provider policy. No markdown.'},{role:'user',content:body.prompt}],temperature:body.temperature,max_tokens:body.max_tokens,provider:{allow_fallbacks:false}})
  });
  if(!response.ok)return output(response.status===429?429:502,{ok:false,error:'NOVEL2_COMPARE_PROVIDER_ERROR',provider_status:response.status});
  let result;try{result=await boundedJson(response,1000000)}catch{return output(502,{ok:false,error:'NOVEL2_COMPARE_RESPONSE_INVALID'})}
  const choice=result?.choices?.[0];
  if(choice?.message?.refusal||choice?.finish_reason==='content_filter')return output(200,{ok:true,refused:true,model:body.model});
  if(choice?.finish_reason==='length')return output(422,{ok:false,error:'NOVEL2_COMPARE_TRUNCATED'});
  if(typeof choice?.message?.content!=='string'||!choice.message.content.trim())return output(502,{ok:false,error:'NOVEL2_COMPARE_EMPTY'});
  return output(200,{ok:true,content:choice.message.content,model:result.model||body.model,usage:result.usage||null});
 }catch{return output(504,{ok:false,error:'NOVEL2_COMPARE_OUTCOME_UNCERTAIN'})}
}
