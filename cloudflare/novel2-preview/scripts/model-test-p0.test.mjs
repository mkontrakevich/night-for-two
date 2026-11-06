import assert from 'node:assert/strict';
import {ModelTestJobs} from '../src/model-test-jobs.js';
import {normalizeFrame,parseUpload,buildModelPrompt,createComparisons,asCsv,PROMPT_COLUMNS,classifyAroma} from '../src/model-test-p0.js';
class Storage{
 constructor(){this.map=new Map();this.alarm=null}async get(k){return structuredClone(this.map.get(k))}async put(k,v){this.map.set(k,structuredClone(v))}async list({prefix}={}){return new Map([...this.map].filter(([k])=>!prefix||k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))}async setAlarm(t){this.alarm=t}async transaction(fn){return fn(this)}
}
const env={NOVEL2_COMPARE_MODELS:JSON.stringify(['p/model-a','p/model-b']),OPENROUTER_API_KEY:'test',MODEL_TESTS_DRIVE_INGEST_KEY:'test_secret_1234567890_1234567890',MODEL_TESTS_PRICE_CEILINGS_JSON:JSON.stringify({'p/model-a':.02,'p/model-b':.03})};
let providerCalls=[],files=new Map(),failNext=false;
const modelReply={frame_title:'Комната',scene_summary:'Двое взрослых рядом с окном',shot_type:'medium shot',camera_angle:'eye-level',lens_mm:50,blocking:{person_a:'у окна',person_b:'справа',hands:'на столе',gaze:'в окно',scale:'средний'},wardrobe_props:'пальто',environment:'отель',lighting:'мягкий свет слева',palette:'тёплая',emotion:'сдержанность',sensory_details:'шелк и бархат',final_image_prompt:'Medium shot, eye-level, two adults, soft window light',negative_prompt:'extra fingers'};
globalThis.fetch=async(url,options)=>{
 const u=String(url);
 if(u.includes('night4two-drive-oauth')&&u.endsWith('/api/drive/ingest')){
   if(failNext){failNext=false;throw Error('network lost')};const data=JSON.parse(options.body);const name=data.filename;
   if(files.has(name))return Response.json({ok:true,id:files.get(name)});
   const id='file_'+String(files.size).padStart(12,'0');files.set(name,id);return Response.json({ok:true,id});
 }
 if(u.includes('openrouter.ai')){
  const body=JSON.parse(options.body);providerCalls.push(body);
  assert.equal(body.temperature,.5);assert.equal(body.max_tokens,1800);
  return Response.json({model:body.model,choices:[{message:{content:JSON.stringify(modelReply)},finish_reason:'stop'}],usage:{prompt_tokens:350,completion_tokens:300,cost:.012}});
 }
 throw Error('unknown url: '+u);
};
const store=new Storage(),jobs=new ModelTestJobs({storage:store},env);
const job=await jobs.create({sceneId:'scene-001',models:['p/model-a','p/model-b'],budget_max_usd:0.05});
assert.equal(job.state,'collecting_inputs');assert.equal(job.inputs,undefined);assert.equal(job.source,undefined);
assert.equal((await jobs.validate(job.id)).ready,false);
await assert.rejects(()=>jobs.start(job.id,true),/INPUTS_INCOMPLETE/);
const asBase64=s=>btoa(unescape(encodeURIComponent(s)));
const inputs=[['scene','scene.txt','Двое взрослых у окна.']];
assert.deepEqual(Object.keys(job.input_files).sort(),['couple_space','sd_story','sensual_director']);
assert.equal(files.size,3);
assert.ok(Object.values(job.input_files).every(x=>x.source==='system'&&x.version&&x.state==='saved'&&x.sha256.length===64));
await assert.rejects(()=>jobs.addAsset({job_id:job.id,role:'sensual_director',filename:'override.md',data:asBase64('override')}),/SYSTEM_INSTRUCTION_IMMUTABLE/);
for(const [role,filename,text] of inputs){const r=await jobs.addAsset({job_id:job.id,role,filename,data:asBase64(text)});assert.equal(r.inputs,undefined);assert.equal(r.input_files[role].state,'saved');}
assert.equal((await jobs.status(job.id)).state,'ready');assert.equal((await jobs.validate(job.id)).ready,true);
const initial=await store.get('job:'+job.id);assert.equal(initial.inputs.scene.text,'Двое взрослых у окна.');assert.ok(initial.inputs.scene.sha256.length===64);
await assert.rejects(()=>jobs.addAsset({job_id:job.id,role:'scene',filename:'scene.txt',data:asBase64('Different text')}),/LOCKED/);
await assert.rejects(()=>jobs.start(job.id,false),/CONFIRM/);
let started=await jobs.start(job.id,true);
assert.equal(started.state,'queued');assert.equal(files.size,5);
await assert.rejects(()=>jobs.start(job.id,true),/INCOMPLETE/);
await jobs.alarm();assert.equal(providerCalls.length,1);
await jobs.alarm();assert.equal(providerCalls.length,2);assert.equal(providerCalls[0].messages[1].content.replaceAll('p/model-a',''),providerCalls[1].messages[1].content.replaceAll('p/model-b',''));
await jobs.alarm();const completed=await jobs.status(job.id);
assert.equal(completed.state,'complete');assert.equal(completed.stage,'complete');assert.equal(providerCalls.length,2);assert.equal(files.size,10);
assert.equal(completed.results.length,2);assert.equal(completed.results[0].normalized.status,'complete');assert.equal(completed.results[1].normalized.status,'complete');
assert.ok(completed.exports.aroma_comparison_csv.id);assert.ok(completed.exports.prompt_comparison_json.id);
const c=await jobs.comparison(job.id);assert.equal(c.prompt.length,2);assert.equal(c.aromas.length,2);
assert.equal(c.aromas[0].evaluator_model,'rules:n4t-aroma-v1');
assert.equal(c.aromas[0].confidence,'low');
assert.equal(c.prompt[0].actual_cost_usd,0.012);
const csv=asCsv(c.prompt,PROMPT_COLUMNS);assert.ok(csv.includes('model_id'));assert.ok(csv.includes('p/model-a'));
assert.equal(normalizeFrame('not valid',{modelId:'p'}).status,'invalid_schema');
const outsider=new ModelTestJobs({storage:new Storage()},env);
await assert.rejects(()=>outsider.status(job.id),/JOB_NOT_FOUND/);
assert.equal(normalizeFrame(JSON.stringify({shot_type:'close',camera_angle:'eye-level',final_image_prompt:'subject'}),{}).status,'complete');
assert.throws(()=>parseUpload({role:'scene',filename:'foo.png',data:asBase64('text')}),/ASSET_FILE_INVALID/);
await jobs.alarm();assert.equal(providerCalls.length,2);assert.equal(files.size,10);
// No paid requests are allowed when model price ceilings are absent.
const noBudgetJobs=new ModelTestJobs({storage:new Storage()},{...env,MODEL_TESTS_PRICE_CEILINGS_JSON:'{}'});
let noBudget=await noBudgetJobs.create({models:['p/model-a'],budget_max_usd:0.1});
for(const [role,filename,text] of inputs)noBudget=await noBudgetJobs.addAsset({job_id:noBudget.id,role,filename,data:asBase64(text)});
assert.equal((await noBudgetJobs.validate(noBudget.id)).ready,false);
await assert.rejects(()=>noBudgetJobs.start(noBudget.id,true),/BUDGET_NOT_CONFIGURED/);
// Failure never auto-retries an uncertain Drive write.
let failed=await jobs.create({models:['p/model-a'],budget_max_usd:0.1});failNext=true;failed=await jobs.addAsset({job_id:failed.id,role:'scene',filename:'test.txt',data:asBase64('First try')});assert.equal(failed.state,'input_uncertain');await assert.rejects(()=>jobs.addAsset({job_id:failed.id,role:'scene',filename:'test.txt',data:asBase64('First try')}),/LOCKED/);
// Cyrillic word boundaries and missing evidence must not create false baseline scores.
const russian=classifyAroma({status:'complete',scene_summary:'Мягкий свет справа, рядом двое, камера и объектив, руки слева, бархат и шелк'},'p/model-a');
assert.ok(russian.softness>0);
assert.ok(russian.cinematicity>0);
assert.ok(russian.visual_specificity>0);
assert.equal(russian.elegance,null);
const noEvidence=classifyAroma({status:'complete',scene_summary:'Нейтральная сцена'},'p/model-a');
assert.equal(noEvidence.cinematicity,null);
assert.equal(noEvidence.softness,null);
console.log('NIGHT4TWO_P0_LOCAL_OK', {providerCalls:providerCalls.length,driveFiles:files.size,job:job.id});
