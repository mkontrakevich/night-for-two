import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const text=await fs.readFile(new URL('../../cloudflare/novel2-preview/src/index.js',import.meta.url),'utf8');
const a=text.indexOf('export class ActorSheetWorkflow extends WorkflowEntrypoint {');
const b=text.indexOf('export class PurgatoryWorldWorkflow extends WorkflowEntrypoint {',a);
assert.ok(a>=0&&b>a);
const classCode=text.slice(a,b).replace('export class ActorSheetWorkflow','class ActorSheetWorkflow');
const makeClass=new Function('WorkflowEntrypoint','dataUrlBlob','AI_IMAGE_MODEL',
 classCode+'; return ActorSheetWorkflow;');
const dataUrlBlob=value=>{
 const m=String(value||'').match(/^data:(image\/[-a-zA-Z0-9.+]+);base64,([A-Za-z0-9+/=]+)$/);
 return m?new Blob([Buffer.from(m[2],'base64')],{type:m[1]}):null;
};
const Actor=makeClass(class{},dataUrlBlob,'test-image-model');
let inferCount=0,callbackCount=0,stageCount=0;
const store=new Map(),job='1eb19248-79ca-43bc-904a-99235147bb55';
const image=btoa('actor-jpeg-dummy'.repeat(160));
const ref='data:image/jpeg;base64,'+btoa('fake-ref-pixels');
const env={
 NOVEL2_THEATRE:{
   async put(key,value){store.set(key,value)},
   async get(key){
     const bytes=store.get(key);if(!bytes)return null;
     return {size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
   },
   async delete(key){store.delete(key)}
 },
 NOVEL2_ORIGIN_HOST:'example.internal', NOVEL2_ORIGIN_PORT:'5690', NOVEL2_SERVICE_SECRET:'private',
 NOVEL2_VPC:{fetch:async request=>{
   const url=new URL(request.url),body=await request.json();
   if(url.pathname.endsWith('/work'))return Response.json({ok:true,work:{
     refs:[ref],prompt:'A neutral silk actor casting sheet',width:832,height:1344
   }});
   if(url.pathname.endsWith('/complete')){
     callbackCount++;
     if(callbackCount===1)return Response.json({ok:false,error:'temporary'}, {status:503});
     assert.equal(body.status,'ready');
     assert.equal(body.image,image);
     return Response.json({ok:true});
   }
   throw new Error('unexpected route '+url.pathname);
 }},
 AI:{run:async()=>{inferCount++;return{image}}}
};
const actor=new Actor();actor.env=env;
const step={do:async(name,opts,fn)=>{
 stageCount++;
 if(name.startsWith('render'))assert.equal(opts.retries.limit,0);
 if(name.startsWith('sync')){
   assert.ok(opts.retries.limit>0);
   for(let i=0;i<opts.retries.limit+1;i++)try{return await fn()}catch(e){
     if(i===opts.retries.limit)throw e;
   }
 }
 return fn();
}};
const result=await actor.run({payload:{role:'A',job_id:job}},step);
assert.equal(result.status,'ready');
assert.equal(inferCount,1,'retrying result sync must not repeat AI inference');
assert.equal(callbackCount,2);
assert.equal(stageCount,2,'generation and persistence must be separate durable steps');
assert.equal(store.size,0,'delete staging JPEG after canonical storage commits');
console.log('NOVEL2_DURABLE_ACTOR_WORKFLOW_OK: one AI inference, resilient callback retry');
