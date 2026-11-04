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
