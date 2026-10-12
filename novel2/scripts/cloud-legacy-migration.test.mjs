import assert from 'node:assert/strict';
import {handleMigrationAdmin,runLegacyMigration,LEGACY_TABLES}
 from '../../cloudflare/novel2-preview/src/migrate-legacy.js';
import fs from 'node:fs/promises';
const schema=await fs.readFile(new URL('../../cloudflare/novel2-preview/migrations/0001_cloud_native.sql',import.meta.url),'utf8');
assert.match(schema,/CREATE TABLE IF NOT EXISTS actor_identity/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS migration_entries/);
assert.equal(LEGACY_TABLES.length,9);
let state=null;const entries=new Map(),objects=new Map(),jobs=[];
const env={
 NOVEL2_SERVICE_SECRET:'internal-service-secret',NOVEL2_ORIGIN_HOST:'private.internal',NOVEL2_ORIGIN_PORT:'5690',
 LEGACY_MIGRATION_WORKFLOW:{create:async spec=>jobs.push(spec)},
 NOVEL2_THEATRE:{put:async(k,v)=>objects.set(k,v)},
 NOVEL2_DB:{prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.includes('WHERE id=?'))return state;
   if(sql.includes('WHERE state IN'))return state?.state==='working'||state?.state==='snapshotted'?{id:state.id,state:state.state}:null;
   return null
  },
  async run(){
   if(sql.startsWith('INSERT INTO migration_runs')){
    state={id:args[0],state:args[1],table_index:0,row_offset:0,records:0};return{meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE migration_runs')){
    if(sql.includes('table_index=?,row_offset=?,records=records+?')){
     state.table_index=args[0];state.row_offset=args[1];state.records+=args[2];
    }else if(sql.includes('table_index=?,row_offset=0')){state.table_index=args[0];state.row_offset=0}
    else if(sql.includes('state=?,error_code=""'))state.state=args[0];
    else if(sql.includes('state=?,error_code=?'))state.state=args[0];
    return{meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO migration_entries')){entries.set(args[0]+':'+args[1],{key:args[2],digest:args[3]});return{meta:{changes:1}}}
   throw Error('Unexpected D1 SQL '+sql);
  }
 }}}}},
 NOVEL2_VPC:{fetch:async request=>{
  assert.equal(request.headers.get('x-novel2-service-key'),'internal-service-secret');
  const body=await request.json();
  const records=body.table==='books'&&body.offset===0?[{key:'42',data:{id:42,title:'Sample book',pair_key:'PRIVATE',current_scene:{prose:'Sample'}}}]:[];
  return Response.json({ok:true,table:body.table,offset:body.offset,records,
   next_offset:body.offset+records.length,more:false});
 }}
};
const url='https://example.invalid/novel2-ai/migration/';
const request=(action,data)=>new Request(url+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const unauthorized=await handleMigrationAdmin(request('start',{confirm:'COPY_PRIVATE_LEGACY_DATA_TO_CLOUDFLARE'}),env,new URL(url+'start'),false);
assert.equal(unauthorized.status,401);
const noConfirm=await handleMigrationAdmin(request('start',{}),env,new URL(url+'start'),true);
assert.equal(noConfirm.status,422);
const first=await handleMigrationAdmin(request('start',{confirm:'COPY_PRIVATE_LEGACY_DATA_TO_CLOUDFLARE'}),env,new URL(url+'start'),true);
assert.equal(first.status,202);
assert.equal(jobs.length,1);
const repeated=await handleMigrationAdmin(request('start',{confirm:'COPY_PRIVATE_LEGACY_DATA_TO_CLOUDFLARE'}),env,new URL(url+'start'),true);
assert.equal(repeated.status,200);
assert.equal(jobs.length,1);
const result=await runLegacyMigration(env,jobs[0].params,{do:async(_name,_opts,fn)=>fn()});
assert.equal(result.status,'snapshotted');
assert.equal(entries.size,1);
assert.equal(objects.size,1);
const row=JSON.parse([...objects.values()][0]);
assert.equal(row.id,42);
assert.equal(state.records,1);
assert.equal(state.table_index,LEGACY_TABLES.length);
const ready=await handleMigrationAdmin(request('status',{job_id:state.id}),env,new URL(url+'status'),true);
assert.equal((await ready.json()).migration.state,'snapshotted');
console.log('NOVEL2_PRIVATE_LEGACY_SNAPSHOT_OK schema, auth, cursor, D1, R2, idempotent job');
