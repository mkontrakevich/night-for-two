/* Cloudflare-owned identity casting. Photo bytes in PRIVATE R2; only metadata in D1.
 * This is a migration endpoint; existing production story/actor routes remain intact
 * until their state has been reconciled and verified against legacy PostgreSQL. */
import {guestFromRequest} from './stranger.js';
const MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const json=(status,obj)=>Response.json(obj,{status,headers:{'cache-control':'no-store','x-novel2-actor-cloud':'1'}});
const safeJson=(text,fallback)=>{try{return JSON.parse(text)}catch{return fallback}};
const slug=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
const prefix=guest=>'actor-v2/'+guest.key+'/';
const now=()=>new Date().toISOString();
function decodeJpeg(value,maxBytes){
 const text=String(value||'');
 const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(text);
 if(!match||match[1].length>Math.ceil(maxBytes*4/3)+20)throw Error('NOVEL2_ACTOR_JPEG_REQUIRED');
 const binary=atob(match[1]),bytes=new Uint8Array(binary.length);
 if(bytes.length<40||bytes.length>maxBytes||bytes[0]!==255||bytes[1]!==216)throw Error('NOVEL2_ACTOR_IMAGE_INVALID');
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}
// JPEG SOF reader: reject oversized thumbnails before calling FLUX.2's <512px ref input.
function jpegDimensions(bytes){
 let p=2;
 while(p+8<bytes.length){
   if(bytes[p]!==255){p++;continue}
   const marker=bytes[p+1];p+=2;
   if(marker===0xD9||marker===0xDA)break;
   if(marker===0xD8||marker===0x01||(marker>=0xD0&&marker<=0xD7))continue;
   const len=(bytes[p]<<8)+bytes[p+1];
   if(len<2||p+len>bytes.length)break;
   if([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB].includes(marker)){
     return{height:(bytes[p+3]<<8)+bytes[p+4],width:(bytes[p+5]<<8)+bytes[p+6]};
   }
   p+=len;
 }
 throw Error('NOVEL2_ACTOR_JPEG_DIMENSIONS_INVALID');
}
async function row(env,guest){
 return env.NOVEL2_DB.prepare('SELECT * FROM actor_identity WHERE guest_key=?').bind(guest.key).first();
}
const cleanRow=value=>value?{role:value.role,version:value.version,approved:!!value.approved,
 status:value.status,job_id:value.job_id,error_code:value.error_code,
 model:value.model,updated_at:value.updated_at,reference_count:safeJson(value.reference_keys,[]).length}:null;
async function readActorImage(env,key){
 if(!key)return'';
 const obj=await env.NOVEL2_THEATRE.get(key);
 if(!obj||obj.size>9_000_000)return'';
 const bytes=new Uint8Array(await obj.arrayBuffer());
 let binary='';
 for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return 'data:image/jpeg;base64,'+btoa(binary);
}
function card(role,count){
 return{kind:'base_actor_identity',role,
  passport:{fiction_name:'Игрок '+role,age:null,gender:'',story_role:'',archetype:'',biography:'',story_hook:''},
  actor_identity:{neutral:true,source:'user_photos',source_photo_count:count,story_role_assigned:false,
    presentation:'neutral casting reference',wardrobe:'opaque ivory silk over neutral opaque bodysuit'},
  visual:{unknown_traits:['Body and face details not established by source images'],
    consistency_rules:['same identity in every view','do not alter nose, eyes, skin texture or proportions']},
  behavioral_baseline:{relationship_grounded:false},psychology:{},romance:{},literary_portrait:'',
  visual_dna:{consistency_rules:['source photographs govern likeness','no new face or body geometry'],
    wardrobe_anchor:'ivory silk drape over fully opaque neutral bodysuit',do_not_change:[]}};
}
const actorPrompt=role=>[
 'PREMIUM EDITORIAL FOUR-PANEL CASTING SHEET, 832x1344 portrait.',
 'Show the SAME ADULT PERSON accurately reconstructed from the supplied reference images.',
 'Top row: LARGE equally scaled frontal portrait and strict side profile; bottom row: full body front and back.',
 'Never crop heads, feet, face or hair. Exact same person, real observable facial anatomy and body proportions.',
 'Especially preserve nose geometry, eyes, jaw, hairline, skin texture and apparent age. Do not beautify or swap faces.',
 'Wardrobe: refined natural IVORY SILK DRAPE over fully OPAQUE flesh-neutral bodysuit, elegant and nontransparent.',
 'Silk follows the silhouette subtly; face is uncovered. Graceful neutral posture, no erotic pose, no nudity.',
 'Warm-gray studio, 85mm portrait perspective, credible editorial light, understated luxury.',
 'If body geometry is uncertain, stay conservative. No invented extreme body proportions.',
 'No text, no captions, no logos, no other people, no storyboard.'
].join('\n');
export async function handleNativeActor(request,env,url){
 if(request.method!=='POST'||!url.pathname.startsWith('/novel2/api/cloud/actor/'))return null;
 if(!env.NOVEL2_DB||!env.NOVEL2_THEATRE)return json(503,{ok:false,error:'NOVEL2_ACTOR_D1_R2_MISSING'});
 const guest=await guestFromRequest(request,env);
 if(!guest)return json(401,{ok:false,error:'NOVEL2_ACTOR_AUTH_REQUIRED'});
 const action=url.pathname.slice('/novel2/api/cloud/actor/'.length);
 if(!['build','start','status','approve','looks','remove'].includes(action))
   return json(404,{ok:false,error:'NOVEL2_ACTOR_ACTION_INVALID'});
 let body={};
 try{body=await request.json()}catch{return json(400,{ok:false,error:'NOVEL2_ACTOR_JSON_REQUIRED'})}
 try{
   if(action==='build'){
     if(body.photo_consent!==true)return json(422,{ok:false,error:'NOVEL2_ACTOR_PHOTO_CONSENT_REQUIRED'});
     const photos=body.reference_images,thumbs=body.model_references;
     if(!Array.isArray(photos)||photos.length<1||photos.length>3||
       !Array.isArray(thumbs)||thumbs.length!==photos.length)
       return json(422,{ok:false,error:'NOVEL2_ACTOR_ONE_TO_THREE_PHOTOS_REQUIRED'});
     const original=photos.map(p=>decodeJpeg(p,4_000_000));
     const small=thumbs.map(p=>decodeJpeg(p,250_000));
     for(const bytes of small){
       const d=jpegDimensions(bytes);
       if(d.width>512||d.height>512)throw Error('NOVEL2_ACTOR_THUMB_DIMENSIONS');
     }
     const previous=await row(env,guest);
     if(previous?.status==='working')return json(409,{ok:false,error:'NOVEL2_ACTOR_JOB_IN_PROGRESS'});
     const version=Number(previous?.version||0)+1;
     const head=prefix(guest)+'v'+version+'/';
     const keys=[];
     for(let i=0;i<original.length;i++){
       const hi=head+'original-'+i+'.jpg',lo=head+'model-'+i+'.jpg';
       await env.NOVEL2_THEATRE.put(hi,original[i],{httpMetadata:{contentType:'image/jpeg'}});
       await env.NOVEL2_THEATRE.put(lo,small[i],{httpMetadata:{contentType:'image/jpeg'}});
       keys.push({original:hi,model:lo});
     }
     const neutral=card(guest.role,keys.length);
     await env.NOVEL2_DB.prepare(
       'INSERT INTO actor_identity(guest_key,role,version,status,approved,reference_keys,card_json,identity_lock,image_key,job_id,prompt,model,error_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'+
       ' ON CONFLICT(guest_key) DO UPDATE SET role=excluded.role,version=excluded.version,status=excluded.status,approved=0,'+
       ' reference_keys=excluded.reference_keys,card_json=excluded.card_json,identity_lock=excluded.identity_lock,image_key="",job_id="",prompt="",model="",error_code="",updated_at=excluded.updated_at'
     ).bind(guest.key,guest.role,version,'photos_ready',0,JSON.stringify(keys),JSON.stringify(neutral),
       'IMMUTABLE REAL PERSON IDENTITY: exactly the person in the '+keys.length+' uploaded photographs; no face, age, body, skin or height drift.',
       '','','','','',now()).run();
     // Cleanup old refs only AFTER new D1 state was committed.
     if(previous){
       const old=safeJson(previous.reference_keys,[]);
       for(const entry of old)for(const value of [entry.original,entry.model]){
         if(typeof value==='string'&&value.startsWith(prefix(guest)))try{await env.NOVEL2_THEATRE.delete(value)}catch{}
       }
     }
     return json(200,{ok:true,character:neutral,identity:{role:guest.role,version,approved:false,identity_only:true},
       calibration_required:true,storage:'cloudflare-r2-d1'});
   }
   const current=await row(env,guest);
   if(action==='status'){
     if(!current)return json(200,{ok:true,job:{status:'idle'},identity:null});
     const task={status:current.status==='photos_ready'?'idle':current.status,
       phase:current.status==='working'?'actor_sheet':'done',
       job_id:current.job_id,error_code:current.error_code||'',version:current.version};
     if(current.status==='ready')task.calibration=await readActorImage(env,current.image_key);
     return json(200,{ok:true,job:task,identity:cleanRow(current)});
   }
   if(action==='looks'){
     const actorImage=current?.status==='ready'?await readActorImage(env,current.image_key):'';
     return json(200,{ok:true,looks:actorImage?[{key:'canonical',title:'Карточка актёра',
       image:actorImage,model:current.model,is_primary:true}]:[]});
   }
   if(action==='remove'){
     if(!current)return json(200,{ok:true,deleted:false});
     if(current.status==='working')return json(409,{ok:false,error:'NOVEL2_ACTOR_JOB_IN_PROGRESS'});
     await env.NOVEL2_DB.prepare('DELETE FROM actor_identity WHERE guest_key=?').bind(guest.key).run();
     for(const entry of safeJson(current.reference_keys,[]))for(const value of [entry.original,entry.model]){
       if(typeof value==='string'&&value.startsWith(prefix(guest)))try{await env.NOVEL2_THEATRE.delete(value)}catch{}
     }
     if(current.image_key?.startsWith(prefix(guest)))await env.NOVEL2_THEATRE.delete(current.image_key);
     return json(200,{ok:true,deleted:true});
   }
   if(!current)return json(409,{ok:false,error:'NOVEL2_ACTOR_PHOTOS_REQUIRED'});
   if(action==='approve'){
     if(current.status!=='ready'||!current.image_key)return json(409,{ok:false,error:'NOVEL2_ACTOR_IMAGE_NOT_READY'});
     await env.NOVEL2_DB.prepare('UPDATE actor_identity SET approved=1,updated_at=? WHERE guest_key=? AND status=?')
       .bind(now(),guest.key,'ready').run();
     return json(200,{ok:true,identity:{role:guest.role,approved:true,version:current.version}});
   }
   if(action==='start'){
     if(current.status==='working')return json(200,{ok:true,job:{status:'working',job_id:current.job_id}});
     if(current.status==='ready'&&body.force!==true)return json(200,{ok:true,job:{
       status:'ready',calibration:await readActorImage(env,current.image_key)}});
     if(!['photos_ready','ready','failed'].includes(current.status))return json(409,{ok:false,error:'NOVEL2_ACTOR_INVALID_STATE'});
     if(!env.ACTOR_SHEET_WORKFLOW)return json(503,{ok:false,error:'NOVEL2_ACTOR_WORKFLOW_UNBOUND'});
     const job_id=crypto.randomUUID();
     const changed=await env.NOVEL2_DB.prepare(
       'UPDATE actor_identity SET status=?,approved=0,job_id=?,error_code="",updated_at=? WHERE guest_key=? AND status!=?'
     ).bind('working',job_id,now(),guest.key,'working').run();
     if(!changed.meta?.changes)return json(409,{ok:false,error:'NOVEL2_ACTOR_JOB_LOCKED'});
     try{await env.ACTOR_SHEET_WORKFLOW.create({id:job_id,params:{cloud_guest:guest.key,job_id}})}
     catch{
       await env.NOVEL2_DB.prepare('UPDATE actor_identity SET status=?,error_code=? WHERE guest_key=? AND job_id=?')
         .bind('failed','WORKFLOW_START_FAILED',guest.key,job_id).run();
       return json(503,{ok:false,error:'NOVEL2_ACTOR_WORKFLOW_START_FAILED'});
     }
     return json(200,{ok:true,job:{status:'working',phase:'actor_sheet',job_id}});
   }
 }catch(error){
   console.error('NOVEL2_CLOUD_ACTOR_FAILED',{code:String(error?.message||'ACTOR_ERROR').slice(0,70)});
   return json(422,{ok:false,error:/^NOVEL2_/.test(String(error?.message||''))?error.message:'NOVEL2_ACTOR_OPERATION_FAILED'});
 }
 return json(404,{ok:false,error:'NOVEL2_ACTOR_ACTION_INVALID'});
}
export async function runNativeActor(env,payload,step){
 const guest={key:String(payload.cloud_guest||'')},job=slug(payload.job_id);
 if(!/^[a-f0-9]{64}$/.test(guest.key)||job.length!==36)return{status:'invalid'};
 const stage=await step.do('render native casting once and store in R2',{
   retries:{limit:0,delay:'5 seconds',backoff:'constant'},timeout:'5 minutes'
 },async()=>{
   const current=await row(env,guest);
   if(!current||current.status!=='working'||current.job_id!==job)return{status:'superseded'};
   const refs=safeJson(current.reference_keys,[]);
   if(refs.length<1||refs.length>3)throw Error('NOVEL2_ACTOR_REFERENCES_INVALID');
   const form=new FormData();
   form.append('prompt',actorPrompt(current.role));form.append('width','832');form.append('height','1344');
   for(let i=0;i<refs.length;i++){
     const image=await env.NOVEL2_THEATRE.get(refs[i].model);
     if(!image||image.size>250_000)throw Error('NOVEL2_ACTOR_REFERENCE_LOST');
     form.append('input_image_'+i,new Blob([await image.arrayBuffer()],{type:'image/jpeg'}),'ref-'+i+'.jpg');
   }
   const source=new Response(form);
   const generated=await env.AI.run(MODEL,{multipart:{
     body:source.body,contentType:source.headers.get('content-type')
   }});
   const encoded=String(generated?.image||'').replace(/^data:image\/[\w.+-]+;base64,/,'');
   if(encoded.length<1200||!/^[A-Za-z0-9+/=]+$/.test(encoded))throw Error('NOVEL2_ACTOR_AI_EMPTY');
   const binary=atob(encoded),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const imageKey=prefix(guest)+'renders/'+job+'.jpg';
   await env.NOVEL2_THEATRE.put(imageKey,bytes,{httpMetadata:{contentType:'image/jpeg'}});
   return{status:'staged',imageKey,prompt:actorPrompt(current.role)};
 });
 if(stage.status!=='staged')return stage;
 return step.do('commit R2 actor result to D1 without AI retry',{
   retries:{limit:7,delay:'15 seconds',backoff:'exponential'},timeout:'90 seconds'
 },async()=>{
   const result=await env.NOVEL2_DB.prepare(
     'UPDATE actor_identity SET status=?,image_key=?,prompt=?,model=?,error_code="",updated_at=? WHERE guest_key=? AND job_id=? AND status=?'
   ).bind('ready',stage.imageKey,stage.prompt,MODEL,now(),guest.key,job,'working').run();
   if(!result.meta?.changes){
     await env.NOVEL2_THEATRE.delete(stage.imageKey);
     return{status:'superseded'};
   }
   return{status:'ready'};
 });
}
