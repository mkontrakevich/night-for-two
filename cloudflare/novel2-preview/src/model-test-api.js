import {guestFromRequest} from './stranger.js';
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
async function input(request){
 if(!request.body)throw Error('INVALID_REQUEST');const reader=request.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000)throw Error('INVALID_REQUEST');parts.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.byteLength}
 try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data}catch{throw Error('INVALID_REQUEST')}
}
export async function handleModelTests(request,env,url){
 if(!url.pathname.startsWith('/novel2/api/model-tests/')||env.MODEL_TESTS_CLOUD_ENABLED!=='1')return null;
 if(request.method!=='POST')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 const guest=await guestFromRequest(request,env);if(!guest)return reply(403,{ok:false,error:'ACCESS_DENIED'});
 if(!env.MODEL_TEST_JOBS)return reply(503,{ok:false,error:'MODEL_TESTS_NOT_CONFIGURED'});
 const stub=env.MODEL_TEST_JOBS.getByName(guest.key),action=url.pathname.slice('/novel2/api/model-tests/'.length);
 try{
  const data=await input(request);
  if(action==='config')return reply(200,{ok:true,...await stub.config()});
  if(action==='list')return reply(200,{ok:true,jobs:await stub.list()});
  if(action==='upload')return reply(200,{ok:true,job:await stub.create({filename:data.filename,data:data.data,models:data.models})});
  if(action==='status')return reply(200,{ok:true,job:await stub.status(data.job_id)});
  if(action==='start')return reply(202,{ok:true,job:await stub.start(data.job_id,data.confirm)});
  return reply(404,{ok:false,error:'NOT_FOUND'});
 }catch(error){const code=/^[A-Z][A-Z0-9_]{1,80}$/.test(String(error?.message||''))?error.message:'MODEL_TESTS_FAILED';return reply(code==='MODEL_TESTS_NOT_CONFIGURED'||code==='DRIVE_NOT_CONFIGURED'?503:422,{ok:false,error:code})}
}
