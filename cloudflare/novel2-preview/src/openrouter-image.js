export function selectImageModel(raw,kind) {
  let config;try{config=JSON.parse(raw||'')}catch{return null}
  if(!['cinematic_romance','mystery','editorial','landscape'].includes(kind))return null;
  if(!Array.isArray(config.models)||!Number.isFinite(config.max_usd)||config.max_usd<=0)return null;
  const candidates=config.models.filter(m=>typeof m.id==='string'&&/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(m.id)&&Array.isArray(m.kinds)&&m.kinds.includes(kind)&&m.enabled===true&&Number.isFinite(m.estimated_usd)&&m.estimated_usd>=0&&m.estimated_usd<=config.max_usd);
  candidates.sort((a,b)=>(Number(b.priority||0)-Number(a.priority||0))||(a.estimated_usd-b.estimated_usd)||a.id.localeCompare(b.id));
  return candidates.length?{model:candidates[0].id,reason:'configured_kind_priority',estimated_usd:candidates[0].estimated_usd}:null;
}
export async function openRouterImage({key,model,prompt,request=fetch}) {
  if(!key||!model) return {ok:false,error:'OPENROUTER_IMAGE_NOT_CONFIGURED'};
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000) return {ok:false,error:'OPENROUTER_IMAGE_PROMPT_INVALID'};
  let response;
  try { response=await request('https://openrouter.ai/api/v1/images',{
    method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
    body:JSON.stringify({model,prompt,n:1,output_format:'png'}),signal:AbortSignal.timeout(180000)
  }); } catch { return {ok:false,error:'OPENROUTER_IMAGE_RESPONSE_UNCERTAIN'}; }
  if(!response.ok)return {ok:false,error:'OPENROUTER_IMAGE_HTTP_'+response.status};
  try {
    const data=await response.json(), image=data?.data?.[0];
    if(typeof image?.b64_json!=='string'||image.b64_json.length>22000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.b64_json))return {ok:false,error:'OPENROUTER_IMAGE_RESPONSE_INVALID'};
    const format=image.media_type||'image/png';
    if(!['image/png','image/jpeg','image/webp'].includes(format))return {ok:false,error:'OPENROUTER_IMAGE_RESPONSE_INVALID'};
    return {ok:true,image:'data:'+format+';base64,'+image.b64_json,model,provider:'openrouter',usage:data.usage||null};
  } catch {return {ok:false,error:'OPENROUTER_IMAGE_RESPONSE_UNCERTAIN'};}
}
