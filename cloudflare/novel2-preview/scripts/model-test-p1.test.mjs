import assert from 'node:assert/strict';
import {ModelTestJobs} from '../src/model-test-jobs.js';
class Storage{
 constructor(){this.map=new Map();this.alarm=null}
 async get(k){return structuredClone(this.map.get(k))}
 async put(k,v){this.map.set(k,structuredClone(v))}
 async list({prefix}={}){return new Map([...this.map].filter(([k])=>!prefix||k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))}
 async setAlarm(t){this.alarm=t}
 async transaction(fn){return fn(this)}
}
function fixture(w,h){const b=new Uint8Array(100).fill(1);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,w);v.setUint32(20,h);return b}
const sketch=fixture(288,496),draft=fixture(768,1344),objects=new Map();let paidCalls=0;
const r2={
 async head(k){const o=objects.get(k);return o?{size:o.bytes.length,customMetadata:o.metadata}:null},
 async put(k,bytes,options){objects.set(k,{bytes:new Uint8Array(bytes),metadata:options.customMetadata})},
 async get(k){const x=objects.get(k);return x?{arrayBuffer:async()=>x.bytes.buffer.slice(x.bytes.byteOffset,x.bytes.byteOffset+x.bytes.byteLength)}:null}
};
const ai={async run(){paidCalls++;return {image:btoa(String.fromCharCode(...(paidCalls===1?sketch:draft)))}}};
const base={MODEL_TESTS_P1_ENABLED:'1',MODEL_TESTS_IMAGE_CEILING_USD:'0.01',AI:ai,MODEL_TEST_MEDIA:r2};
const storage=new Storage(),jobs=new ModelTestJobs({storage},base);
const id='a1b2c3d4-1111-4222-8333-123456789abc';
const frame={status:'complete',scene_summary:'Два взрослых персонажа у окна',shot_type:'medium shot',camera_angle:'eye-level',lens_mm:50,blocking:{hands:'на столе'},environment:'отель',lighting:'тёплая лампа',final_image_prompt:'Two fictional adults near hotel window, soft cinematic light',negative_prompt:'extra fingers'};
await storage.put('job:'+id,{id,sceneId:'scene-001',state:'complete',stage:'complete',inputs:{},models:['fixture/model-a'],results:[{model:'fixture/model-a',status:'complete',normalized:frame}],exports:{},createdAt:Date.now(),updatedAt:Date.now()});
const selected=await jobs.selectPrompt({job_id:id,model_id:'fixture/model-a'});assert.equal(selected.state,'sketch_ready');assert.ok(selected.selection.prompt_sha256.length===64);
await assert.rejects(()=>jobs.selectPrompt({job_id:id,model_id:'fixture/model-a'}),/NOT_SELECTABLE/);
await assert.rejects(()=>jobs.sketchStart({job_id:id,confirm:true,budget_max_usd:0.001}),/BUDGET_REQUIRED/);
const queued=await jobs.sketchStart({job_id:id,confirm:true,budget_max_usd:0.01});assert.equal(queued.state,'sketch_queued');
await jobs.alarm();let j=await jobs.status(id);assert.equal(j.state,'sketch_review');assert.ok(j.sketch.r2.key);assert.equal(paidCalls,1);
await assert.rejects(()=>jobs.imageStart({job_id:id,confirm:true,budget_max_usd:0.01}),/APPROVAL_REQUIRED/);
await jobs.sketchApprove({job_id:id,approved:true,notes:'approved composition'});j=await jobs.status(id);assert.equal(j.state,'sketch_approved');
await jobs.imageStart({job_id:id,confirm:true,budget_max_usd:0.01});await jobs.alarm();j=await jobs.status(id);assert.equal(j.state,'image_review');assert.equal(j.image.reference_sha256,j.sketch.r2.sha256);assert.equal(paidCalls,2);
await jobs.imageApprove({job_id:id,approved:true,notes:'QA passed'});j=await jobs.status(id);assert.equal(j.state,'image_approved');assert.equal(objects.size,2);
await jobs.alarm();assert.equal(paidCalls,2);
assert.notEqual((await jobs.mediaMeta({job_id:id,phase:'sketch'})).key,(await jobs.mediaMeta({job_id:id,phase:'image'})).key);
const gate=new ModelTestJobs({storage:new Storage()},{...base,MODEL_TESTS_P1_ENABLED:'0'});
await assert.rejects(()=>gate.sketchStart({job_id:id,confirm:true,budget_max_usd:0.01}),/P1_DISABLED/);
console.log('NIGHT4TWO_P1_STATEFUL_OK',{modelCalls:paidCalls,r2:objects.size});
