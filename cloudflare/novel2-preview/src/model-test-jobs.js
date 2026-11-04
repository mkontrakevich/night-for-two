import {DurableObject} from 'cloudflare:workers';
import {modelComparison} from './model-comparison.js';
import {modelTestDrive} from './model-test-drive.js';
import {beginModel,finishModel,interrupted} from './model-test-state.js';

const key=id=>'job:'+id;
const view=job=>{const {source,...safe}=job;return safe};
const validId=id=>/^[a-f0-9-]{36}$/.test(String(id||''));
const timeoutMs=120000;
function modelsFor(env){try{const list=JSON.parse(env.NOVEL2_COMPARE_MODELS||'[]');return Array.isArray(list)?list:[]}catch{return []}}

// One Durable Object per authenticated Telegram owner. No caller may choose
// another owner's object ID; only the authenticated Worker constructs the stub.
export class ModelTestJobs extends DurableObject{
 async config(){const models=modelsFor(this.env);modelTestDrive(this.env);if(!this.env.OPENROUTER_API_KEY||!models.length)throw Error('MODEL_TESTS_NOT_CONFIGURED');return {models}}
 async list(){const all=await this.ctx.storage.list({prefix:'job:',limit:100});return [...all.values()].map(view).sort((a,b)=>b.createdAt-a.createdAt)}
 async status(id){if(!validId(id))throw Error('JOB_NOT_FOUND');let job=await this.ctx.storage.get(key(id));if(!job)throw Error('JOB_NOT_FOUND');if(['running','uploading_source','exporting'].includes(job.state)&&Date.now()-job.updatedAt>timeoutMs){job=interrupted(job);job.updatedAt=Date.now();await this.ctx.storage.put(key(id),job)}return view(job)}
 async create({filename,data,models}){
  const allowed=(await this.config()).models;
  if((await this.ctx.storage.list({prefix:'job:',limit:101})).size>=100)throw Error('JOB_LIMIT_REACHED');
  if(typeof filename!=='string'||!/\.txt$/i.test(filename)||filename.length>160||/[\\/\x00-\x1f]/.test(filename))throw Error('TXT_REQUIRED');
  if(typeof data!=='string'||data.length>86000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('FILE_INVALID');
  let binary;try{binary=atob(data)}catch{throw Error('FILE_INVALID')}
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(!bytes.length||bytes.length>64000)throw Error('FILE_SIZE_INVALID');
  let prompt;try{prompt=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('UTF8_REQUIRED')}
  if(!prompt.trim()||prompt.includes('\0'))throw Error('FILE_INVALID');
  if(!Array.isArray(models)||models.length<1||models.length>10||new Set(models).size!==models.length||models.some(m=>!allowed.includes(m)))throw Error('MODEL_INVALID');
  const id=crypto.randomUUID(),now=Date.now();let job={id,filename,models,source:prompt,state:'uploading_source',results:[],createdAt:now,updatedAt:now};
  await this.ctx.storage.put(key(id),job);
  try{const uploaded=await modelTestDrive(this.env).upload(filename,'text/plain',bytes,id,'source');job={...job,state:'ready',sourceFile:uploaded,updatedAt:Date.now()}}
  catch{job={...job,state:'source_uncertain',updatedAt:Date.now()}}
  await this.ctx.storage.put(key(id),job);return view(job);
 }
 async start(id,confirm){
  if(confirm!==true)throw Error('CONFIRMATION_REQUIRED');
  if(!validId(id))throw Error('JOB_NOT_FOUND');
  const job=await this.ctx.storage.transaction(async txn=>{
   let current=await txn.get(key(id));if(!current)throw Error('JOB_NOT_FOUND');if(current.state!=='ready')throw Error('JOB_ALREADY_STARTED');
   current={...current,state:'queued',updatedAt:Date.now()};await txn.put(key(id),current);return current;
  });
  await this.ctx.storage.setAlarm(Date.now()+1000);return view(job);
 }
 async alarm(){
  if(this.alarmActive){await this.ctx.storage.setAlarm(Date.now()+timeoutMs);return}this.alarmActive=true;
  try{
   const all=await this.ctx.storage.list({prefix:'job:',limit:100});
   const pending=[...all.values()].filter(j=>['running','exporting','queued','ready_to_export'].includes(j.state)).sort((a,b)=>a.createdAt-b.createdAt);
   let job=pending[0];if(!job)return;
   if(['running','exporting'].includes(job.state)){
    if(Date.now()-job.updatedAt<timeoutMs){await this.ctx.storage.setAlarm(job.updatedAt+timeoutMs);return}
    job=interrupted(job);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+1000);return;
   }
   if(job.state==='queued'){
    job=beginModel(job);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+timeoutMs);
    let result={uncertain:true};
    try{const response=await modelComparison(new Request('https://internal/compare',{method:'POST',body:JSON.stringify({model:job.results.at(-1).model,prompt:job.source})}),this.env);if(response.ok)result=await response.json()}catch{}
    const current=await this.ctx.storage.get(key(job.id));if(current?.state==='running'&&current.attempt===job.attempt){job=finishModel(current,job.attempt,result);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job)}
    await this.ctx.storage.setAlarm(Date.now()+1000);return;
   }
   if(job.state==='ready_to_export'){
    job={...job,state:'exporting',updatedAt:Date.now()};await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+timeoutMs);
    const payload=new TextEncoder().encode(JSON.stringify({version:1,sourceFile:job.sourceFile,models:job.models,results:job.results},null,2));
    try{const output=await modelTestDrive(this.env).upload('model-test-'+job.id+'.json','application/json',payload,job.id,'result');job={...job,state:'complete',export:{state:'complete',...output},updatedAt:Date.now()}}
    catch{job={...job,state:'export_uncertain',export:{state:'uncertain'},updatedAt:Date.now()}}
    const current=await this.ctx.storage.get(key(job.id));if(current?.state==='exporting')await this.ctx.storage.put(key(job.id),job);
    await this.ctx.storage.setAlarm(Date.now()+1000);
   }
  }finally{this.alarmActive=false}
 }
}
