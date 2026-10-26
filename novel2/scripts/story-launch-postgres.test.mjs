import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStoryLaunchQueue,publishStoryLaunch} from '../src/story-launch.js';
import pg from 'pg';

const connectionString=process.env.NOVEL2_LAUNCH_TEST_DATABASE_URL;
if(!connectionString)throw new Error('ISOLATED_LAUNCH_TEST_DATABASE_REQUIRED');
const schema='launch_test_'+Date.now();
const admin=new pg.Pool({connectionString});
await admin.query(`CREATE SCHEMA ${schema}`);
const db=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:6});
const raw=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
const databaseSchema=raw.match(/const schema = `([\s\S]*?)`;/)?.[1];assert(databaseSchema);
const pair='isolated-test';
const bible={title:'Fixture',canon:{},first_scene:{target_role:'A',prose:'Fixture scene'}};
const entry={slot_key:'A',source_type:'player',source_id:'A',interactive_role:'A',control_mode:'human'};
const addDraft=async()=>{const {rows}=await db.query("INSERT INTO novel2_story_drafts(pair_key,title) VALUES($1,'Fixture') RETURNING id",[pair]);return rows[0].id;};
try{
  await db.query(databaseSchema);
  let gate;const wait=new Promise(r=>gate=r);let executions=0;
  const execute=async({draftId,save,client})=>{executions++;await save('first_chapter',{bible});await wait;return publishStoryLaunch(client,{pair,draftId,bible,castEntries:[entry],assignments:{A:'player:A'}});};
  const q=createStoryLaunchQueue({db,pairKey:()=>pair,validate:async()=>{},execute});await q.init();
  const other=createStoryLaunchQueue({db,pairKey:()=>pair,validate:async()=>{},execute});
  const draftId=await addDraft(),otherId=await addDraft();
  assert.equal((await q.start('A',draftId)).status,'working');
  await other.start('A',draftId);assert.equal(executions,1);
  await assert.rejects(other.start('A',otherId),/ALREADY_RUNNING/);
  gate();await q.drain();
  const completed=await q.get('A',draftId);assert.equal(completed.status,'ready');
  await other.start('A',draftId);assert.equal(executions,1);
  const client=await db.connect();
  try{
    const again=await publishStoryLaunch(client,{pair,draftId,bible,castEntries:[entry],assignments:{}});
    assert.equal(String(again),String(completed.book_id));
  }finally{client.release();}
  assert.equal((await db.query('SELECT count(*)::int AS n FROM novel2_books')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM novel2_turns')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM novel2_book_cast')).rows[0].n,1);
  const failure=createStoryLaunchQueue({db,pairKey:()=>pair,validate:async()=>{},execute:async({draftId,client,save})=>{
    await save('publishing',{bible});
    await publishStoryLaunch(client,{pair,draftId,bible,castEntries:[{...entry,source_type:'INVALID'}],assignments:{}});
  }});
  await failure.start('A',otherId);await failure.drain();
  assert.equal((await failure.get('A',otherId)).status,'failed');
  assert.equal((await db.query('SELECT status FROM novel2_books WHERE id=$1',[completed.book_id])).rows[0].status,'active','Failed publication must not archive the previous book');
  assert.equal((await db.query('SELECT status FROM novel2_story_drafts WHERE id=$1',[otherId])).rows[0].status,'draft');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM novel2_books')).rows[0].n,1,'No half-created books');
  await db.query("UPDATE novel2_story_launch_jobs SET status='working',updated_at=now()-interval '5 minutes' WHERE draft_id=$1",[otherId]);
  let resumed=0;
  const restarted=createStoryLaunchQueue({db,pairKey:()=>pair,validate:async()=>{},execute:async({draftId,checkpoint,client})=>{
    resumed++;assert.equal(checkpoint.bible.title,'Fixture');
    await publishStoryLaunch(client,{pair,draftId,bible:checkpoint.bible,castEntries:[entry],assignments:{}});
  }});
  await restarted.start('A',otherId);assert.equal(resumed,0,'Process restart cannot auto-replay uncertain generation');
  await restarted.start('A',otherId,{resume:true});await restarted.drain();assert.equal(resumed,1);
  assert.equal((await restarted.get('A',otherId)).status,'ready');
  assert.equal(await restarted.get('B',otherId),null);
  console.log('NOVEL2_LAUNCH_POSTGRES_OK concurrent_tabs process_lock atomic_publish rollback restart explicit_resume');
}finally{
  await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
