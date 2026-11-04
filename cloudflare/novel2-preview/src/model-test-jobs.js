import {DurableObject} from 'cloudflare:workers';
import {modelComparison} from './model-comparison.js';
import {modelTestDrive} from './model-test-drive.js';
import {beginModel,finishModel,interrupted} from './model-test-state.js';
import {runPencil,runImage,persistOriginal,digest} from './model-test-image.js';
import {ROLES,parseUpload,sha256Hex,buildModelPrompt,normalizeFrame,createComparisons,asCsv,PROMPT_COLUMNS,AROMA_COLUMNS} from './model-test-p0.js';
const key=id=>'job:'+id;
const validId=id=>/^[a-f0-9-]{36}$/.test(String(id||''));
const timeoutMs=120000;
const encoder=new TextEncoder();
const utc=()=>new Date().toISOString();
const MAX_JOBS=100;
const compareKinds=[
 ['result','application/json'],['prompt_comparison_json','application/json'],
 ['prompt_comparison_csv','text/csv'],['aroma_comparison_json','application/json'],['aroma_comparison_csv','text/csv']
];
function modelsFor(env){try{const list=JSON.parse(env.NOVEL2_COMPARE_MODELS||'[]');return Array.isArray(list)?list.filter(x=>typeof x==='string'):[]}catch{return []}}
function pricesFor(env){try{const obj=JSON.parse(env.MODEL_TESTS_PRICE_CEILINGS_JSON||'{}');return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:{}}catch{return {}}}
function costCeilings(models,env){const price=pricesFor(env),out={};for(const m of models){const v=price[m];if(typeof v!=='number'||!Number.isFinite(v)||v<=0)throw Error('BUDGET_NOT_CONFIGURED');out[m]=v;}return out}
function publicJob(job){
 const {source,inputs,modelPrompt,attempt,...rest}=job;
 const view={...rest};
 view.input_files={};for(const role of ROLES){const v=inputs?.[role];if(v)view.input_files[role]={filename:v.filename,sha256:v.sha256,bytes:v.bytes,state:v.state,drive:v.file||null}}
 // Hide full raw prompt and per-input text; model results are outputs, not private inputs.
 return view;
}
function requireThree(job){return ROLES.every(role=>job.inputs?.[role]?.state==='saved'&&job.inputs[role].file?.id)}
function manifestOf(job){return {schema_version:'n4t-test-v1',job_id:job.id,scope:'fiction_test',scene_id:job.sceneId,inputs:Object.fromEntries(ROLES.map(role=>{const v=job.inputs[role];return [role,{filename:v.filename,sha256:v.sha256,bytes:v.bytes,drive_file_id:v.file.id}]})),text_models:job.models,generation_params:job.params,budget:{max_usd:job.budgetMaxUsd,estimated_ceiling_usd:job.estimatedCeilingUsd},created_at:job.createdAtIso}}
export class ModelTestJobs extends DurableObject {
 async config(){const models=modelsFor(this.env);modelTestDrive(this.env);if(!this.env.OPENROUTER_API_KEY||!models.length)throw Error('MODEL_TESTS_NOT_CONFIGURED');const prices=pricesFor(this.env);return {models,model_cost_ceiling_usd:Object.fromEntries(models.map(m=>[m,typeof prices[m]==='number'?prices[m]:null])),required_inputs:ROLES,schema_version:'n4t-test-v1'};}
 async list(){const all=await this.ctx.storage.list({prefix:'job:',limit:MAX_JOBS});return [...all.values()].map(publicJob).sort((a,b)=>b.createdAt-a.createdAt)}
 async status(id){if(!validId(id))throw Error('JOB_NOT_FOUND');let job=await this.ctx.storage.get(key(id));if(!job)throw Error('JOB_NOT_FOUND');if(['running','uploading_source','exporting','uploading_input','preparing_manifest','sketch_generating','image_generating'].includes(job.state)&&Date.now()-job.updatedAt>timeoutMs){
  if(job.state==='uploading_input')job.state='input_uncertain';else if(job.state==='preparing_manifest')job.state='manifest_uncertain';else if(job.state==='sketch_generating'||job.state==='image_generating')job.state='image_uncertain';else job=interrupted(job);
  job.updatedAt=Date.now();await this.ctx.storage.put(key(id),job);
 }return publicJob(job)}
 async create({sceneId='scene-001',models,budget_max_usd,budgetMaxUsd,filename,data}={}){
  const allowed=(await this.config()).models;
  if((await this.ctx.storage.list({prefix:'job:',limit:MAX_JOBS+1})).size>=MAX_JOBS)throw Error('JOB_LIMIT_REACHED');
  if(typeof sceneId!=='string'||!/^[a-zA-Z0-9_.-]{1,60}$/.test(sceneId))throw Error('SCENE_ID_INVALID');
  if(!Array.isArray(models)||models.length<1||models.length>10||new Set(models).size!==models.length||models.some(m=>!allowed.includes(m)))throw Error('MODEL_INVALID');
  const max=Number(budget_max_usd??budgetMaxUsd??0);
  if(!Number.isFinite(max)||max<0||max>100)throw Error('BUDGET_INVALID');
  const id=crypto.randomUUID(),now=Date.now();
  const job={id,scope:'fiction_test',sceneId,models,params:{temperature:0.5,max_tokens:1800,language:'ru'},budgetMaxUsd:max,estimatedCeilingUsd:null,modelCostCeilings:{},inputs:{},state:'collecting_inputs',stage:'input',results:[],exports:{},createdAt:now,createdAtIso:utc(),updatedAt:now};
  await this.ctx.storage.put(key(id),job);
  if(filename!==undefined||data!==undefined){return this.addAsset({job_id:id,role:'scene',filename,data});}
  return publicJob(job);
 }
 async addAsset({job_id,role,filename,data,sha256}={}){
  if(!validId(job_id))throw Error('JOB_NOT_FOUND');
  if(!ROLES.includes(role))throw Error('ASSET_ROLE_INVALID');
  const input=parseUpload({role,filename,data,sha256});
  const hash=await sha256Hex(input.bytes);
  if(input.claimedHash&&hash!==input.claimedHash)throw Error('ASSET_HASH_MISMATCH');
  const reserved=await this.ctx.storage.transaction(async txn=>{
    const job=await txn.get(key(job_id));if(!job)throw Error('JOB_NOT_FOUND');
    const existing=job.inputs?.[role];
    if(existing){if(existing.sha256===hash&&existing.state==='saved')return {job,alreadySaved:true};throw Error('ASSET_SLOT_LOCKED')}
    if(job.stage!=='input'||!['collecting_inputs','ready'].includes(job.state))throw Error('INPUTS_FROZEN');
    job.inputs[role]={filename:input.filename,sha256:hash,bytes:input.bytes.length,text:input.text,state:'uploading'};
    job.state='uploading_input';job.updatedAt=Date.now();await txn.put(key(job.id),job);
    return {job,alreadySaved:false};
  });
  if(reserved.alreadySaved)return publicJob(reserved.job);
  let job=reserved.job;
  let uploaded;
  try{uploaded=await modelTestDrive(this.env).upload(input.filename,role==='scene'?'text/plain':'text/markdown',input.bytes,job.id,role)}
  catch{job.inputs[role].state='uncertain';job.state='input_uncertain';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);return publicJob(job)}
  job.inputs[role].file=uploaded;job.inputs[role].state='saved';job.state=requireThree(job)?'ready':'collecting_inputs';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);
  return publicJob(job);
 }
 async validate(id){const job=await this.ctx.storage.get(key(id));if(!job)throw Error('JOB_NOT_FOUND');const missing=ROLES.filter(r=>job.inputs?.[r]?.state!=='saved');let cost=null,block=null;
  try{const ceilings=costCeilings(job.models,this.env);cost=Object.values(ceilings).reduce((a,b)=>a+b,0)}catch(e){block=e.message}
  if(!block&&(!(job.budgetMaxUsd>0)||job.budgetMaxUsd+1e-9<cost))block='BUDGET_APPROVAL_REQUIRED';
  return {job_id:job.id,ready:missing.length===0&&job.state==='ready'&&!block,missing,inputs:publicJob(job).input_files,estimated_ceiling_usd:cost,budget_max_usd:job.budgetMaxUsd,blocker:block,model_count:job.models.length};
 }
 async start(id,confirm,phase='text'){
  if(confirm!==true)throw Error('CONFIRMATION_REQUIRED');if(phase!=='text')throw Error('PHASE_INVALID');if(!validId(id))throw Error('JOB_NOT_FOUND');
  const job=await this.ctx.storage.transaction(async txn=>{
    const item=await txn.get(key(id));if(!item)throw Error('JOB_NOT_FOUND');
    if(item.state!=='ready'||!requireThree(item))throw Error('INPUTS_INCOMPLETE');
    const ceilings=costCeilings(item.models,this.env),amount=Object.values(ceilings).reduce((a,b)=>a+b,0);
    if(!(item.budgetMaxUsd>0)||item.budgetMaxUsd+1e-9<amount)throw Error('BUDGET_APPROVAL_REQUIRED');
    item.estimatedCeilingUsd=amount;item.modelCostCeilings=ceilings;
    item.state='preparing_manifest';item.updatedAt=Date.now();await txn.put(key(id),item);return item;
  });
  const manifest=manifestOf(job);
  try{job.manifestFile=await modelTestDrive(this.env).upload('test_package.json','application/json',encoder.encode(JSON.stringify(manifest,null,2)),id,'manifest')}
  catch{job.state='manifest_uncertain';job.updatedAt=Date.now();await this.ctx.storage.put(key(id),job);return publicJob(job)}
  job.state='queued';job.stage='text';job.updatedAt=Date.now();await this.ctx.storage.put(key(id),job);
  await this.ctx.storage.setAlarm(Date.now()+1000);return publicJob(job);
 }
 async comparison(id){if(!validId(id))throw Error('JOB_NOT_FOUND');const job=await this.ctx.storage.get(key(id));if(!job)throw Error('JOB_NOT_FOUND');if(!['comparison','complete','sketch','image'].includes(job.stage))throw Error('COMPARISON_NOT_READY');return {job_id:job.id,stage:job.stage,state:job.state,prompt:job.comparison?.prompt||[],aromas:job.comparison?.aromas||[],exports:job.exports||{}}}
 async selectPrompt({job_id,model_id}={}){
  if(!validId(job_id))throw Error('JOB_NOT_FOUND');
  return this.ctx.storage.transaction(async txn=>{
   const job=await txn.get(key(job_id));if(!job)throw Error('JOB_NOT_FOUND');
   if(job.stage!=='complete'||job.state!=='complete'||job.selection)throw Error('P1_PROMPT_NOT_SELECTABLE');
   const item=job.results.find(x=>x.model===model_id&&x.status==='complete'&&x.normalized?.status==='complete');
   if(!item||!item.normalized.final_image_prompt)throw Error('P1_FRAME_NOT_APPROVED');
   const frame=item.normalized,promptHash=await digest(encoder.encode(frame.final_image_prompt));
   job.selection={model_id,frame,prompt_sha256:promptHash,selected_at:utc()};
   job.stage='sketch';job.state='sketch_ready';job.updatedAt=Date.now();await txn.put(key(job.id),job);
   return publicJob(job);
  });
 }
 async sketchStart({job_id,confirm,format='portrait',budget_max_usd}={}){
  if(confirm!==true)throw Error('CONFIRMATION_REQUIRED');
  if(this.env.MODEL_TESTS_P1_ENABLED!=='1'||!this.env.AI||!this.env.MODEL_TEST_MEDIA)throw Error('P1_DISABLED');
  const ceiling=Number(this.env.MODEL_TESTS_IMAGE_CEILING_USD||0),budget=Number(budget_max_usd||0);
  if(!(ceiling>0&&Number.isFinite(ceiling)&&budget>=ceiling&&budget<=100))throw Error('P1_BUDGET_REQUIRED');
  if(!['portrait','landscape','square'].includes(format))throw Error('P1_FORMAT_INVALID');
  const job=await this.ctx.storage.transaction(async txn=>{
   const j=await txn.get(key(job_id));if(!j)throw Error('JOB_NOT_FOUND');
   if(j.state!=='sketch_ready'||j.stage!=='sketch'||!j.selection)throw Error('P1_SKETCH_NOT_READY');
   j.state='sketch_queued';j.format=format;j.sketch_budget_ceiling_usd=ceiling;j.sketch_approved_budget_usd=budget;j.updatedAt=Date.now();await txn.put(key(job_id),j);return j;
  });
  await this.ctx.storage.setAlarm(Date.now()+1000);return publicJob(job);
 }
 async sketchApprove({job_id,approved,notes}={}){
  if(typeof approved!=='boolean')throw Error('P1_APPROVAL_REQUIRED');
  return this.ctx.storage.transaction(async txn=>{
   const j=await txn.get(key(job_id));if(!j)throw Error('JOB_NOT_FOUND');
   if(j.stage!=='sketch'||j.state!=='sketch_review'||!j.sketch?.r2?.key)throw Error('P1_SKETCH_NOT_REVIEWABLE');
   j.sketch.approval={approved,notes:String(notes||'').slice(0,500),at:utc()};
   j.state=approved?'sketch_approved':'sketch_rejected';j.updatedAt=Date.now();await txn.put(key(job_id),j);return publicJob(j);
  });
 }
 async imageStart({job_id,confirm,budget_max_usd}={}){
  if(confirm!==true)throw Error('CONFIRMATION_REQUIRED');
  if(this.env.MODEL_TESTS_P1_ENABLED!=='1'||!this.env.AI||!this.env.MODEL_TEST_MEDIA)throw Error('P1_DISABLED');
  const ceiling=Number(this.env.MODEL_TESTS_IMAGE_CEILING_USD||0),budget=Number(budget_max_usd||0);
  if(!(ceiling>0&&Number.isFinite(ceiling)&&budget>=ceiling&&budget<=100))throw Error('P1_BUDGET_REQUIRED');
  const job=await this.ctx.storage.transaction(async txn=>{
   const j=await txn.get(key(job_id));if(!j)throw Error('JOB_NOT_FOUND');
   if(j.state!=='sketch_approved'||!j.sketch?.approval?.approved||!j.sketch?.r2?.key)throw Error('P1_SKETCH_APPROVAL_REQUIRED');
   j.state='image_queued';j.stage='image';j.image_budget_ceiling_usd=ceiling;j.image_approved_budget_usd=budget;j.updatedAt=Date.now();await txn.put(key(job_id),j);return j;
  });
  await this.ctx.storage.setAlarm(Date.now()+1000);return publicJob(job);
 }
 async imageApprove({job_id,approved,notes}={}){
  if(typeof approved!=='boolean')throw Error('P1_APPROVAL_REQUIRED');
  return this.ctx.storage.transaction(async txn=>{
   const j=await txn.get(key(job_id));if(!j)throw Error('JOB_NOT_FOUND');
   if(j.stage!=='image'||j.state!=='image_review'||!j.image?.r2?.key)throw Error('P1_IMAGE_NOT_REVIEWABLE');
   j.image.approval={approved,notes:String(notes||'').slice(0,500),at:utc()};j.state=approved?'image_approved':'image_rejected';j.updatedAt=Date.now();await txn.put(key(job_id),j);return publicJob(j);
  });
 }
 async mediaMeta({job_id,phase}={}){
  if(!validId(job_id)||!['sketch','image'].includes(phase))throw Error('P1_MEDIA_INVALID');
  const j=await this.ctx.storage.get(key(job_id));if(!j)throw Error('JOB_NOT_FOUND');
  const media=j[phase];if(!media?.r2?.key)throw Error('P1_MEDIA_NOT_FOUND');
  return {job_id,phase,...media.r2,approved:media.approval?.approved===true,drive:media.drive||null};
 }
 async mediaReceipt({job_id,phase,sha256,file_id}={}){
  if(!validId(job_id)||!['sketch','image'].includes(phase)||!/^[0-9a-f]{64}$/.test(String(sha256))||!/^[A-Za-z0-9_-]{10,200}$/.test(String(file_id)))throw Error('P1_MEDIA_RECEIPT_INVALID');
  return this.ctx.storage.transaction(async txn=>{
   const j=await txn.get(key(job_id));if(!j)throw Error('JOB_NOT_FOUND');
   const media=j[phase];if(!media?.r2?.key||media.r2.sha256!==sha256||media.approval?.approved!==true)throw Error('P1_MEDIA_NOT_APPROVED');
   if(media.drive?.id&&media.drive.id!==file_id)throw Error('P1_MEDIA_RECEIPT_CONFLICT');
   media.drive={id:file_id,sha256,state:'saved',at:utc()};j.updatedAt=Date.now();await txn.put(key(job_id),j);
   return {phase,drive:media.drive};
  });
 }
 async alarm(){
  if(this.alarmActive){await this.ctx.storage.setAlarm(Date.now()+timeoutMs);return}this.alarmActive=true;
  try{
   const all=await this.ctx.storage.list({prefix:'job:',limit:MAX_JOBS});const pending=[...all.values()].filter(j=>['running','exporting','queued','ready_to_export','sketch_queued','image_queued','sketch_generating','image_generating'].includes(j.state)).sort((a,b)=>a.createdAt-b.createdAt);
   let job=pending[0];if(!job)return;
   if(['sketch_generating','image_generating'].includes(job.state)){
    if(Date.now()-job.updatedAt<timeoutMs){await this.ctx.storage.setAlarm(job.updatedAt+timeoutMs);return}
    job.state='image_uncertain';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);return;
   }
   if(job.state==='sketch_queued'){
    job.state='sketch_generating';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+timeoutMs);
    try{
     const result=await runPencil(this.env.AI,job.selection.frame,job.format);
     const r2=await persistOriginal(this.env.MODEL_TEST_MEDIA,job.id,'sketch',result);
     job.sketch={id:crypto.randomUUID(),r2,prompt:result.prompt,model:result.model,reference_sha256:job.selection.prompt_sha256,approval:{approved:null},created_at:utc()};
     job.state='sketch_review';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);
    }catch(error){job.state='image_uncertain';job.image_error=String(error?.message||'P1_SKETCH_UNCERTAIN').slice(0,80);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job)}
    return;
   }
   if(job.state==='image_queued'){
    job.state='image_generating';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+timeoutMs);
    try{
     const sketch=await this.env.MODEL_TEST_MEDIA.get(job.sketch.r2.key);if(!sketch)throw Error('P1_SKETCH_MISSING');
     const sketchBytes=new Uint8Array(await sketch.arrayBuffer());
     const result=await runImage(this.env.AI,job.selection.frame,sketchBytes,job.format);
     const r2=await persistOriginal(this.env.MODEL_TEST_MEDIA,job.id,'image',result);
     job.image={id:crypto.randomUUID(),r2,prompt:result.prompt,model:result.model,reference_sha256:result.sketch_sha256,approval:{approved:null},created_at:utc()};
     job.state='image_review';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);
    }catch(error){job.state='image_uncertain';job.image_error=String(error?.message||'P1_IMAGE_UNCERTAIN').slice(0,80);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job)}
    return;
   }
   if(['running','exporting'].includes(job.state)){
    if(Date.now()-job.updatedAt<timeoutMs){await this.ctx.storage.setAlarm(job.updatedAt+timeoutMs);return}
    job=interrupted(job);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+1000);return;
   }
   if(job.state==='queued'){
    job=beginModel(job);job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+timeoutMs);
    let result={uncertain:true};const started=Date.now();
    try{
      const built=buildModelPrompt(job.inputs,job.sceneId);
      const response=await modelComparison(new Request('https://internal/compare',{method:'POST',body:JSON.stringify({model:job.results.at(-1).model,prompt:built,temperature:job.params.temperature,max_tokens:job.params.max_tokens})}),this.env);
      if(response.ok)result=await response.json();else result={uncertain:true,error:'PROVIDER_HTTP_'+response.status};
    }catch{}
    const current=await this.ctx.storage.get(key(job.id));
    if(current?.state==='running'&&current.attempt===job.attempt){
      job=finishModel(current,job.attempt,result);
      const last=job.results.at(-1);if(last.status==='complete'){
        last.normalized=normalizeFrame(last.content,{jobId:job.id,sceneId:job.sceneId,modelId:last.model,attemptId:current.attempt,usage:result.usage,latencyMs:Date.now()-started});
        if(last.normalized.status!=='complete')last.status='invalid_schema';
      }
      job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);
    }
    await this.ctx.storage.setAlarm(Date.now()+1000);return;
   }
   if(job.state==='ready_to_export'){
    job.stage='comparison';job.state='exporting';job.updatedAt=Date.now();job.comparison=createComparisons(job);await this.ctx.storage.put(key(job.id),job);await this.ctx.storage.setAlarm(Date.now()+timeoutMs);
    const comparison=job.comparison;
    const payloads={
      result:JSON.stringify({schema_version:'n4t-test-v1',manifest:manifestOf(job),results:job.results,comparison},null,2),
      prompt_comparison_json:JSON.stringify({schema_version:'n4t-comparison-v1',job_id:job.id,rows:comparison.prompt},null,2),
      prompt_comparison_csv:asCsv(comparison.prompt,PROMPT_COLUMNS),
      aroma_comparison_json:JSON.stringify({schema_version:'n4t-aroma-v1',job_id:job.id,rubric:comparison.rubric,rows:comparison.aromas},null,2),
      aroma_comparison_csv:asCsv(comparison.aromas,AROMA_COLUMNS)
    };
    for(const [kind,mime] of compareKinds){
      try{
        const bytes=encoder.encode(payloads[kind]);
        const receipt=await modelTestDrive(this.env).upload(kind,mime,bytes,job.id,kind);
        job.exports[kind]={state:'saved',...receipt};job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);
      }catch{
        job.exports[kind]={state:'uncertain'};job.state='export_uncertain';job.updatedAt=Date.now();await this.ctx.storage.put(key(job.id),job);return;
      }
    }
    job.state='complete';job.stage='complete';job.updatedAt=Date.now();job.export={state:'complete',...job.exports.result};await this.ctx.storage.put(key(job.id),job);
   }
  }finally{this.alarmActive=false}
 }
}
