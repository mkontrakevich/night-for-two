// Isolated Night4two P0 QA gateway. It is NOT the public Telegram mini-app.
// Protected by a random STAGING_KEY secret; no production game/origin bindings.
export {ModelTestJobs} from './model-test-jobs.js';
const respond=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const same=(a,b)=>{a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
async function bounded(request,limit=130000){if(Number(request.headers.get('content-length')||0)>limit||!request.body)throw Error('INVALID_REQUEST');const reader=request.body.getReader(),parts=[];let n=0;try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>limit)throw Error('INVALID_REQUEST');parts.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(n);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength}try{const obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error();return obj}catch{throw Error('INVALID_REQUEST')}}
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(u.pathname==='/health')return respond({project:'Night4two',role:'test-only',configured:Boolean(env.STAGING_KEY&&env.MODEL_TEST_JOBS),fixture_mode:env.MODEL_TESTS_FIXTURE_MODE==='1',real_model_generation:false});
 if(!u.pathname.startsWith('/api/model-tests/'))return respond({error:'NOT_FOUND'},404);
 if(!env.STAGING_KEY||!same(request.headers.get('x-n4t-staging-key'),env.STAGING_KEY))return respond({error:'UNAUTHORIZED'},401);
 if(request.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405);
 if(!env.MODEL_TEST_JOBS)return respond({error:'DO_NOT_CONFIGURED'},503);
 const action=u.pathname.slice('/api/model-tests/'.length);
 const stub=env.MODEL_TEST_JOBS.getByName('night4two-p0-fixture-owner');
 try{
  const d=await bounded(request);
  if(action==='config')return respond({ok:true,...await stub.config()});
  if(action==='list')return respond({ok:true,jobs:await stub.list()});
  if(action==='create')return respond({ok:true,job:await stub.create({sceneId:d.scene_id,models:d.models,budget_max_usd:d.budget_max_usd})},201);
  if(action==='assets/upload')return respond({ok:true,job:await stub.addAsset({job_id:d.job_id,role:d.role,filename:d.filename,data:d.data_base64,sha256:d.sha256})});
  if(action==='validate')return respond({ok:true,...await stub.validate(d.job_id)});
  if(action==='status')return respond({ok:true,job:await stub.status(d.job_id)});
  if(action==='comparison')return respond({ok:true,...await stub.comparison(d.job_id)});
  if(action==='start')return respond({ok:true,job:await stub.start(d.job_id,d.confirm,d.phase||'text')},202);
  return respond({error:'NOT_FOUND'},404);
 }catch(e){const msg=String(e?.message||'');return respond({ok:false,error:/^[A-Z][A-Z0-9_]{1,80}$/.test(msg)?msg:'STAGING_FAILED'},422)}
}};