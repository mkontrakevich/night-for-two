/* Service-only legacy PostgreSQL -> Cloudflare private R2 + D1 indexed migration.
 * No guest-facing endpoint exposes migrated records; no rows in CI or logs.
 * This is a verifiable snapshot, NOT a production story cutover. */
export const LEGACY_TABLES=Object.freeze([
 'books','turns','identity','ai_characters','story_drafts',
 'book_cast','character_looks','visuals','lobby_world'
]);
const answer=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function digest(value){
 return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
}
export async function handleMigrationAdmin(request,env,url,authorized){
 if(request.method!=='POST'||!['/novel2-ai/migration/start','/novel2-ai/migration/status'].includes(url.pathname))return null;
 if(!authorized)return answer(401,{ok:false,error:'NOVEL2_MIGRATION_UNAUTHORIZED'});
 if(!env.NOVEL2_DB||!env.NOVEL2_THEATRE||!env.LEGACY_MIGRATION_WORKFLOW)
   return answer(503,{ok:false,error:'NOVEL2_MIGRATION_BINDINGS_MISSING'});
 const body=await request.json().catch(()=>({}));
 if(url.pathname.endsWith('/status')){
   const jobId=String(body.job_id||'');
   if(jobId&&!/^[a-f0-9-]{36}$/i.test(jobId))return answer(422,{ok:false,error:'NOVEL2_MIGRATION_JOB_INVALID'});
   const state=jobId
     ?await env.NOVEL2_DB.prepare(
       'SELECT id,state,table_index,row_offset,records,error_code,updated_at FROM migration_runs WHERE id=?'
     ).bind(jobId).first()
     :await env.NOVEL2_DB.prepare(
       'SELECT id,state,table_index,row_offset,records,error_code,updated_at FROM migration_runs ORDER BY updated_at DESC LIMIT 1'
     ).first();
   return answer(state?200:404,state?{ok:true,migration:state}:{ok:false,error:'NOVEL2_MIGRATION_NOT_FOUND'});
 }
 // Requires a second explicit declaration in the request to reduce the risk
 // of accidentally copying private legacy records in a routine health probe.
 if(body.confirm!=='COPY_PRIVATE_LEGACY_DATA_TO_CLOUDFLARE')
   return answer(422,{ok:false,error:'NOVEL2_MIGRATION_CONFIRMATION_REQUIRED'});
 const previous=await env.NOVEL2_DB.prepare("SELECT id,state FROM migration_runs WHERE state IN ('working','snapshotted') ORDER BY updated_at DESC LIMIT 1").first();
 if(previous)return answer(200,{ok:true,job_id:previous.id,state:previous.state,reused:true});
 const jobId=crypto.randomUUID();
 await env.NOVEL2_DB.prepare('INSERT INTO migration_runs(id,state,updated_at) VALUES(?,?,?)')
   .bind(jobId,'working',new Date().toISOString()).run();
 try{await env.LEGACY_MIGRATION_WORKFLOW.create({id:jobId,params:{job_id:jobId}})}
 catch{
   await env.NOVEL2_DB.prepare('UPDATE migration_runs SET state=?,error_code=? WHERE id=?')
     .bind('failed','WORKFLOW_CREATE_FAILED',jobId).run();
   return answer(503,{ok:false,error:'NOVEL2_MIGRATION_WORKFLOW_CREATE_FAILED'});
 }
 return answer(202,{ok:true,job_id:jobId,state:'working'});
}
export async function runLegacyMigration(env,payload,step){
 const jobId=String(payload.job_id||'');
 if(!/^[a-f0-9-]{36}$/i.test(jobId))return{status:'invalid'};
 if(!env.NOVEL2_DB||!env.NOVEL2_THEATRE||!env.NOVEL2_VPC)return{status:'missing_bindings'};
 const host=String(env.NOVEL2_ORIGIN_HOST||'');
 const port=String(env.NOVEL2_ORIGIN_PORT||'5690');
 const secret=String(env.NOVEL2_SERVICE_SECRET||'');
 if(!host||!secret)return{status:'missing_origin'};
 const endpoint='http://'+host+':'+port+'/novel2/api/migration/batch';
 let total=0;
 try{
   for(let index=0;index<LEGACY_TABLES.length;index++){
     const table=LEGACY_TABLES[index];
     // Each table is restartable. R2 objects have stable hashed keys,
     // D1 rows are UPSERTed, and progress is checkpointed per legacy batch.
     const result=await step.do('copy private '+table,{
       retries:{limit:2,delay:'30 seconds',backoff:'exponential'},timeout:'10 minutes'
     },async()=>{
       let state=await env.NOVEL2_DB.prepare('SELECT * FROM migration_runs WHERE id=?').bind(jobId).first();
       if(!state)throw Error('MIGRATION_NOT_FOUND');
       if(Number(state.table_index)>index)return{records:0,complete:true};
       let offset=Number(state.table_index)===index?Number(state.row_offset):0;
       let migrated=0;
       for(let loop=0;loop<20000;loop++){
         const result=await env.NOVEL2_VPC.fetch(new Request(endpoint,{
           method:'POST',headers:{'content-type':'application/json','x-novel2-service-key':secret},
           body:JSON.stringify({table,offset})
         }));
         if(!result.ok)throw Error('MIGRATION_EXPORT_UNAVAILABLE_'+result.status);
         const payload=await result.json();
         if(!payload?.ok||payload.table!==table||payload.offset!==offset||
            !Array.isArray(payload.records)||payload.records.length>2)
           throw Error('MIGRATION_EXPORT_CONTRACT_INVALID');
         for(const item of payload.records){
           const key=String(item.key||'');
           if(!key||typeof item.data!=='object'||item.data===null)throw Error('MIGRATION_RECORD_INVALID');
           const encoded=JSON.stringify(item.data);
           if(encoded.length>19_000_000)throw Error('MIGRATION_RECORD_TOO_LARGE');
           const checksum=await digest(encoded);
           const hashedKey=await digest(table+':'+key);
           const objectKey='legacy-pg-snapshot/'+table+'/'+hashedKey+'.json';
           await env.NOVEL2_THEATRE.put(objectKey,encoded,{httpMetadata:{contentType:'application/json'}});
           await env.NOVEL2_DB.prepare(
             'INSERT INTO migration_entries(table_name,legacy_key,r2_key,sha256,imported_at) VALUES(?,?,?,?,?)'+
             ' ON CONFLICT(table_name,legacy_key) DO UPDATE SET r2_key=excluded.r2_key,sha256=excluded.sha256,imported_at=excluded.imported_at'
           ).bind(table,key,objectKey,checksum,new Date().toISOString()).run();
           migrated++;
         }
         const newOffset=Number(payload.next_offset);
         if(!Number.isSafeInteger(newOffset)||newOffset<offset||newOffset>10_000_000)throw Error('MIGRATION_CURSOR_INVALID');
         await env.NOVEL2_DB.prepare(
           'UPDATE migration_runs SET table_index=?,row_offset=?,records=records+?,updated_at=? WHERE id=? AND state=?'
         ).bind(index,newOffset,payload.records.length,new Date().toISOString(),jobId,'working').run();
         if(!payload.more){
           await env.NOVEL2_DB.prepare(
             'UPDATE migration_runs SET table_index=?,row_offset=0,updated_at=? WHERE id=? AND state=?'
           ).bind(index+1,new Date().toISOString(),jobId,'working').run();
           return{records:migrated,complete:true};
         }
         if(newOffset===offset)throw Error('MIGRATION_CURSOR_STALLED');
         offset=newOffset;
       }
       throw Error('MIGRATION_ROW_LIMIT_REACHED');
     });
     total+=result.records||0;
   }
   await env.NOVEL2_DB.prepare(
     'UPDATE migration_runs SET state=?,error_code="",updated_at=? WHERE id=?'
   ).bind('snapshotted',new Date().toISOString(),jobId).run();
   return{status:'snapshotted',records_processed_this_attempt:total};
 }catch(error){
   const code=String(error?.message||'MIGRATION_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,80);
   console.error('NOVEL2_LEGACY_MIGRATION_FAILED',{code});
   await env.NOVEL2_DB.prepare(
     'UPDATE migration_runs SET state=?,error_code=?,updated_at=? WHERE id=?'
   ).bind('failed',code,new Date().toISOString(),jobId).run().catch(()=>{});
   return{status:'failed',error_code:code};
 }
}
