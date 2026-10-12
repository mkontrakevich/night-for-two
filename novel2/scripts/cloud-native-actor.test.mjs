import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {handleNativeActor,runNativeActor} from '../../cloudflare/novel2-preview/src/native-actor.js';

const jpeg=await sharp({create:{width:960,height:1120,channels:3,background:{r:121,g:110,b:100}}})
 .jpeg({quality:80}).toBuffer();
const thumb=await sharp(jpeg).resize({width:480,height:480,fit:'inside'})
 .jpeg({quality:75}).toBuffer();
const photo='data:image/jpeg;base64,'+jpeg.toString('base64');
const model='data:image/jpeg;base64,'+thumb.toString('base64');
const token='signed-test-token',owner='77766';
const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(owner)})});
const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
params.set('hash',crypto.createHmac('sha256',crypto.createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
const signed=params.toString();
let record=null,charges=0;
const images=new Map(),jobs=[];
const env={
 NOVEL2_TELEGRAM_BOT_TOKEN:token,NOVEL2_ALLOWED_USER_IDS:owner+',55555',
 NOVEL2_THEATRE:{
  async put(k,v){images.set(k,new Uint8Array(v instanceof Uint8Array?v:await new Response(v).arrayBuffer()))},
  async get(k){const bytes=images.get(k);return bytes?{size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer}:null},
  async delete(k){images.delete(k)}
 },
 NOVEL2_DB:{prepare(sql){return{bind(...v){return{
  async first(){if(sql.includes('FROM actor_identity'))return record?{...record}:null;return null},
  async run(){
   if(sql.startsWith('INSERT INTO actor_identity')){
    record={guest_key:v[0],role:v[1],version:v[2],status:v[3],approved:v[4],
     reference_keys:v[5],card_json:v[6],identity_lock:v[7],image_key:v[8],
     job_id:v[9],prompt:v[10],model:v[11],error_code:v[12],updated_at:v[13]};
    return{meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE actor_identity')){
    const previous={...record};
    if(sql.includes('status!=?')){record.status=v[0];record.approved=0;record.job_id=v[1];record.error_code='';record.updated_at=v[2];}
    else if(sql.includes('status=?,image_key=')){
     if(record.job_id!==v[6])return{meta:{changes:0}};
     record.status=v[0];record.image_key=v[1];record.prompt=v[2];record.model=v[3];record.updated_at=v[4];
    }else if(sql.includes('approved=1')){record.approved=1;record.updated_at=v[0];}
    else if(sql.includes('error_code=?')){record.status=v[0];record.error_code=v[1];}
    else throw Error('unexpected update: '+sql);
    assert.ok(previous);
    return{meta:{changes:1}};
   }
   if(sql.startsWith('DELETE FROM actor_identity')){record=null;return{meta:{changes:1}}}
   throw Error('unexpected query: '+sql);
  }
 }}}}},
 ACTOR_SHEET_WORKFLOW:{create:async job=>jobs.push(job)},
 AI:{run:async()=>{charges++;return{image:jpeg.toString('base64')}}}
};
const route='/novel2/api/cloud/actor/';
const req=(action,payload,auth=true)=>new Request('https://example.invalid'+route+action,{
 method:'POST',headers:{'content-type':'application/json',...(auth?{'x-telegram-init-data':signed}:{})},
 body:JSON.stringify(payload)
});
const api=async(action,payload={},auth=true)=>{
 const result=await handleNativeActor(req(action,payload,auth),env,new URL('https://example.invalid'+route+action));
 return{status:result.status,data:await result.json()};
};
assert.equal((await api('status',{},false)).status,401,'non-guest actor data must stay private');
assert.equal((await api('build',{reference_images:[photo],model_references:[model]})).status,422,'explicit consent required');
let build=await api('build',{photo_consent:true,reference_images:[photo],model_references:[model]});
assert.equal(build.status,200);
assert.equal(build.data.identity.role,'A');
assert.equal(build.data.character.kind,'base_actor_identity');
assert.equal((await api('status')).data.job.status,'idle');
let start=await api('start',{});
assert.equal(start.data.job.status,'working');
assert.equal(jobs.length,1);
const repeat=await api('start',{});
assert.equal(repeat.data.job.job_id,start.data.job.job_id);
assert.equal(jobs.length,1,'duplicate start must not create another paid job');
const guest=jobs[0].params.cloud_guest;
const result=await runNativeActor(env,jobs[0].params,{do:async(_name,_opts,fn)=>fn()});
assert.equal(result.status,'ready');
assert.equal(charges,4,'four independent view inferences in one explicitly requested casting job');
let status=await api('status');
assert.equal(status.data.job.status,'ready');
assert.match(status.data.job.calibration,/^data:image\/svg\+xml;base64,/);
const svg=Buffer.from(status.data.job.calibration.split(',')[1],'base64').toString();
assert.equal((svg.match(/<image /g)||[]).length,4,'all four views are clipped independent images');
const flat=await sharp(Buffer.from(svg)).jpeg().toBuffer();
assert.equal((await sharp(flat).metadata()).height,1536);
assert.equal((await api('approve')).data.identity.approved,true);
assert.equal((await api('looks')).data.looks.length,1);
assert.ok(images.size>=3);
assert.equal((await api('remove')).data.deleted,true);
assert.equal(record,null);
assert.equal(images.size,0,'delete all saved actor photos and generated image');
assert.match(guest,/^[a-f0-9]{64}$/);
console.log('NOVEL2_NATIVE_CLOUD_ACTOR_OK consent, auth, photos, D1, R2, four clipped independent views, approve, delete');
