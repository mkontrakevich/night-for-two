import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {ACTOR_VIEW_SPEC,actorViewPrompt,bytesFromAiImage,base64FromBytes,compositeActorSvg} from '../../cloudflare/novel2-preview/src/actor-sheet-compose.js';

const text=await fs.readFile(new URL('../../cloudflare/novel2-preview/src/index.js',import.meta.url),'utf8');
const a=text.indexOf('export class ActorSheetWorkflow extends WorkflowEntrypoint {');
const b=text.indexOf('export class LegacyMigrationWorkflow extends WorkflowEntrypoint {',a);
assert.ok(a>=0&&b>a);
const classCode=text.slice(a,b).replace('export class ActorSheetWorkflow','class ActorSheetWorkflow');
const makeClass=new Function('WorkflowEntrypoint','dataUrlBlob','AI_IMAGE_MODEL',
 'ACTOR_VIEW_SPEC','actorViewPrompt','bytesFromAiImage','base64FromBytes','compositeActorSvg',
 classCode+'; return ActorSheetWorkflow;');
const dataUrlBlob=value=>{
 const m=String(value||'').match(/^data:(image\/[-a-zA-Z0-9.+]+);base64,([A-Za-z0-9+/=]+)$/);
 return m?new Blob([Buffer.from(m[2],'base64')],{type:m[1]}):null;
};
const Actor=makeClass(class{},dataUrlBlob,'test-image-model',ACTOR_VIEW_SPEC,
 actorViewPrompt,bytesFromAiImage,base64FromBytes,compositeActorSvg);
let inferCount=0,callbackCount=0,stageCount=0;
const store=new Map(),job='1eb19248-79ca-43bc-904a-99235147bb55';
const jpeg=await sharp({create:{width:512,height:896,channels:3,background:{r:139,g:122,b:116}}}).jpeg().toBuffer();
const image=jpeg.toString('base64');
const ref='data:image/jpeg;base64,'+image;
const env={
 NOVEL2_THEATRE:{
   async put(key,value){store.set(key,value)},
   async get(key){
     const bytes=store.get(key);if(!bytes)return null;
     return {size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
   },
   async delete(key){store.delete(key)}
 },
 NOVEL2_ORIGIN_HOST:'example.internal',NOVEL2_ORIGIN_PORT:'5690',NOVEL2_SERVICE_SECRET:'private',
 NOVEL2_VPC:{fetch:async request=>{
   const url=new URL(request.url),body=await request.json();
   if(url.pathname.endsWith('/work'))return Response.json({ok:true,work:{
     refs:[ref],prompt:'Identity lock for this same single adult human',
     width:832,height:1344
   }});
   if(url.pathname.endsWith('/complete')){
     callbackCount++;
     if(callbackCount===1)return Response.json({ok:false,error:'temporary'}, {status:503});
     assert.equal(body.status,'ready');
     assert.match(Buffer.from(body.image,'base64').toString('utf8'),/^<\?xml.*<svg /);
     assert.equal((await sharp(Buffer.from(body.image,'base64')).metadata()).format,'svg');
     const raster=await sharp(Buffer.from(body.image,'base64')).jpeg().toBuffer();
     const meta=await sharp(raster).metadata();
     assert.equal(meta.width,1024);
     assert.equal(meta.height,1536);
     return Response.json({ok:true});
   }
   throw new Error('unexpected route '+url.pathname);
 }},
 AI:{run:async(_model,opts)=>{
   inferCount++;
   const request=new Response(opts.multipart.body);
   const form=await request.formData();
   const prompt=String(form.get('prompt')||'');
   assert.match(prompt,/ONE AND ONLY ONE PERSON/);
   assert.doesNotMatch(prompt,/FOUR clean panels/);
   return{image};
 }}
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
assert.equal(inferCount,4,'each of four views must be independently rendered exactly once');
assert.equal(callbackCount,2,'callback failure must not repeat image inference');
assert.equal(stageCount,6,'four isolated R2 checkpoints, one assembly, one callback');
assert.equal(store.size,0,'clear private R2 rendering checkpoints after origin stores JPEG');
console.log('NOVEL2_DURABLE_ACTOR_WORKFLOW_OK: four isolated views, clipped assembly, retry without repeat inference');
