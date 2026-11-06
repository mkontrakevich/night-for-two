// Isolated Night4two P0 gateway. No production game, VPC, or D1 bindings.
// Two independent auth paths: signed Telegram owner for the UI and a random
// staging-only secret for controlled machine QA. Real provider disabled.
import page from './model-test-staging-ui.js';
import {digest} from './model-test-image.js';
export {ModelTestJobs} from './model-test-jobs.js';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const equal=(a,b)=>{a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
async function verifyTelegram(req,env){
 const raw=req.headers.get('x-telegram-init-data')||'';
 if(!env.NOVEL2_TELEGRAM_BOT_TOKEN||raw.length<30||raw.length>8000)return null;
 const fields=new URLSearchParams(raw),hash=fields.get('hash')||'',date=Number(fields.get('auth_date')||0);
 if(!/^[0-9a-f]{64}$/i.test(hash)||!Number.isSafeInteger(date)||date<=0||Math.abs(Date.now()/1000-date)>86400)return null;
 let user;try{user=JSON.parse(fields.get('user')||'null')}catch{return null}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)return null;
 const allowed=String(env.NOVEL2_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!allowed.includes(String(user.id)))return null;
 const payload=[...fields.entries()].filter(([k])=>k!=='hash'&&k!=='signature').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const keyBytes=new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode(env.NOVEL2_TELEGRAM_BOT_TOKEN)));
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const computed=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return equal(hash.toLowerCase(),computed)?String(user.id):null;
}
async function bounded(req,limit=130000){
 if(Number(req.headers.get('content-length')||0)>limit||!req.body)throw Error('INVALID_REQUEST');
 const reader=req.body.getReader(),parts=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>limit)throw Error('INVALID_REQUEST');parts.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(n);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength}
 try{const obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error();return obj}catch{throw Error('INVALID_REQUEST')}
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==='/health')return reply({service:'Night4two staging',fixture_mode:env.MODEL_TESTS_FIXTURE_MODE==='1',real_model_generation:false,telegram_configured:Boolean(env.NOVEL2_TELEGRAM_BOT_TOKEN&&env.NOVEL2_ALLOWED_USER_IDS),do_connected:Boolean(env.MODEL_TEST_JOBS)});
 if(u.pathname==='/novel2/model-tests.html'&&req.method==='GET')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'SAMEORIGIN','x-content-type-options':'nosniff'}});
 const forTelegram=u.pathname.startsWith('/novel2/api/model-tests/');
 const forMachine=u.pathname.startsWith('/api/model-tests/');
 if(!forTelegram&&!forMachine)return reply({error:'NOT_FOUND'},404);
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 const owner=forTelegram?await verifyTelegram(req,env):null;
 const machine=forMachine&&Boolean(env.STAGING_KEY)&&equal(req.headers.get('x-n4t-staging-key'),env.STAGING_KEY);
 if(!owner&&!machine)return reply({ok:false,error:'UNAUTHORIZED'},401);
 if(!env.MODEL_TEST_JOBS)return reply({ok:false,error:'DO_NOT_CONFIGURED'},503);
 const prefix=forTelegram?'/novel2/api/model-tests/':'/api/model-tests/';
 const action=u.pathname.slice(prefix.length);
 const stub=env.MODEL_TEST_JOBS.getByName(owner?'tg:'+owner:'machine:night4two-staging');
 try{
  const d=await bounded(req);

  if(action==='select-prompt')return reply({ok:true,job:await stub.selectPrompt({job_id:d.job_id,model_id:d.model_id})});
  if(action==='sketch/start')return reply({ok:true,job:await stub.sketchStart({job_id:d.job_id,confirm:d.confirm,format:d.format,budget_max_usd:d.budget_max_usd})},202);
  if(action==='sketch/approve')return reply({ok:true,job:await stub.sketchApprove({job_id:d.job_id,approved:d.approved,notes:d.notes})});
  if(action==='image/start')return reply({ok:true,job:await stub.imageStart({job_id:d.job_id,confirm:d.confirm,budget_max_usd:d.budget_max_usd})},202);
  if(action==='image/approve')return reply({ok:true,job:await stub.imageApprove({job_id:d.job_id,approved:d.approved,notes:d.notes})});
  if(action==='media/get'){
   if(!env.MODEL_TEST_MEDIA)return reply({ok:false,error:'P1_DISABLED'},503);
   const meta=await stub.mediaMeta({job_id:d.job_id,phase:d.phase});
   const file=await env.MODEL_TEST_MEDIA.get(meta.key);
   if(!file)return reply({ok:false,error:'P1_MEDIA_NOT_FOUND'},404);
   return new Response(file.body,{headers:{'content-type':meta.mime,'cache-control':'no-store','x-content-type-options':'nosniff','content-disposition':'inline'}});
  }
  if(action==='media/export'){
   if(!env.MODEL_TEST_MEDIA||!env.MODEL_TESTS_DRIVE_INGEST_KEY)return reply({ok:false,error:'P1_DISABLED'},503);
   const meta=await stub.mediaMeta({job_id:d.job_id,phase:d.phase});
   if(!meta.approved)return reply({ok:false,error:'P1_MEDIA_NOT_APPROVED'},409);
   if(meta.drive?.id)return reply({ok:true,existing:true,drive:meta.drive});
   const object=await env.MODEL_TEST_MEDIA.get(meta.key);
   if(!object||object.size>12_000_000)return reply({ok:false,error:'P1_MEDIA_NOT_FOUND'},404);
   const raw=new Uint8Array(await object.arrayBuffer());
   if(await digest(raw)!==meta.sha256)return reply({ok:false,error:'P1_MEDIA_HASH_MISMATCH'},409);
   // Chunk sizes are divisible by three: concatenated Base64 remains valid.
   const parts=[];for(let i=0;i<raw.length;i+=32766)parts.push(btoa(String.fromCharCode(...raw.subarray(i,i+32766))));
   const output=await fetch('https://night4two-drive-oauth.kontrakevich.workers.dev/api/drive/media/ingest',{
    method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+env.MODEL_TESTS_DRIVE_INGEST_KEY},
    body:JSON.stringify({job_id:d.job_id,phase:d.phase,mime:meta.mime,sha256:meta.sha256,content_base64:parts.join('')}),signal:AbortSignal.timeout(60000)
   });
   if(!output.ok)return reply({ok:false,error:'P1_MEDIA_DRIVE_EXPORT_UNCERTAIN'},502);
   const result=await output.json().catch(()=>null);
   if(!result?.ok||!/^[A-Za-z0-9_-]{10,200}$/.test(String(result.id||'')))return reply({ok:false,error:'P1_MEDIA_DRIVE_EXPORT_UNCERTAIN'},502);
   const saved=await stub.mediaReceipt({job_id:d.job_id,phase:d.phase,sha256:meta.sha256,file_id:result.id});
   return reply({ok:true,drive:saved.drive});
  }
  if(action==='config')return reply({ok:true,p1_enabled:env.MODEL_TESTS_P1_ENABLED==='1',staging_fixture_mode:env.MODEL_TESTS_FIXTURE_MODE==='1',...await stub.config()});
  if(action==='list')return reply({ok:true,jobs:await stub.list()});
  if(action==='create')return reply({ok:true,job:await stub.create({sceneId:d.scene_id,models:d.models,budget_max_usd:d.budget_max_usd})},201);
  if(action==='assets/upload')return reply({ok:true,job:await stub.addAsset({job_id:d.job_id,role:d.role,filename:d.filename,data:d.data_base64,sha256:d.sha256})});
  if(action==='validate')return reply({ok:true,...await stub.validate(d.job_id)});
  if(action==='status')return reply({ok:true,job:await stub.status(d.job_id)});
  if(action==='comparison')return reply({ok:true,...await stub.comparison(d.job_id)});
  if(action==='start')return reply({ok:true,job:await stub.start(d.job_id,d.confirm,d.phase||'text')},202);
  return reply({ok:false,error:'NOT_FOUND'},404);
 }catch(error){const msg=String(error?.message||'');return reply({ok:false,error:/^[A-Z][A-Z0-9_]{1,80}$/.test(msg)?msg:'STAGING_FAILED'},422)}
}};