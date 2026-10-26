import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createStoryLaunchQueue,publicLaunchJob} from '../src/story-launch.js';

const browser={};vm.runInNewContext(fs.readFileSync(new URL('../public/story-launch-client.js',import.meta.url),'utf8'),browser);
const Client=browser.Novel2StoryLaunchClient;
function harness(api,shared=new Map()){
  const scheduled=[],events=[];
  const client=new Client({api,role:()=> 'A',storage:{getItem:k=>shared.get(k),setItem:(k,v)=>shared.set(k,v),removeItem:k=>shared.delete(k)},
    onJob:job=>events.push(['job',job.status]),onReady:result=>events.push(['ready',result.state.book.id]),onError:error=>events.push(['error',error.message]),
    schedule:fn=>{scheduled.push(fn);return fn;},cancel:fn=>{const i=scheduled.indexOf(fn);if(i>=0)scheduled.splice(i,1);}});
  return {client,scheduled,events,shared};
}
const working={draft_id:'7',status:'working',stage:'first_chapter'};
const ready={...working,status:'ready',book_id:'8'};
{
  let submitted=0,checks=0;
  const h=harness(async(path)=>{
    if(path==='story/draft/launch'){submitted++;throw new TypeError('Load failed');}
    checks++;return {ok:true,job:checks===1?null:working};
  });
  await h.client.start('7');
  assert.equal(submitted,1,'Lost 202 must reconcile with status without replaying generation');
  assert.equal(h.client.remembered(),'7');assert.equal(h.events.at(-1)[0],'job');
  h.client.stop();
  const reopened=harness(async path=>{assert.equal(path,'story/draft/launch/status');return {job:ready,state:{book:{id:'8'}}};},h.shared);
  await reopened.client.check();assert.equal(reopened.events.at(-1)[0],'ready');assert.equal(reopened.client.remembered(),'');
}
{
  let submissions=0;
  const h=harness(async path=>{if(path==='story/draft/launch')submissions++;throw new Error('NOT_FOUND');});
  await h.client.start('7');assert.equal(submissions,0,'Old origin capability failure must not call synchronous generation');
  assert.equal(h.events.at(-1)[0],'error');
}
{
  let submissions=0;
  const h=harness(async path=>{
    if(path==='story/draft/launch'){submissions++;return {job:working};}
    return {job:{...working,status:'failed'}};
  });
  await h.client.start('7');assert.equal(submissions,0);assert.equal(h.scheduled.length,0);
  await h.client.start('7',{resume:true});assert.equal(submissions,1);h.client.stop();
}
{
  const h=harness(async()=>{throw new TypeError('Load failed');});h.client.remember('7');
  await h.client.check();assert.equal(h.client.remembered(),'7');assert.equal(h.scheduled.length,0);assert.equal(h.events.at(-1)[0],'error');
}

// Unit fixture for process concurrency. PostgreSQL transaction and advisory-lock
// behavior are independently verified by story-launch-postgres.test.mjs in CI.
function fixture(){
  const rows=new Map();let locked=false;
  const query=async(sql,args=[])=>{
    const key=args.slice(0,2).join(':');
    if(sql.includes('pg_try_advisory_lock')){if(locked)return {rows:[{locked:false}]};locked=true;return {rows:[{locked:true}]};}
    if(sql.includes('pg_advisory_unlock')){locked=false;return {rows:[]};}
    if(sql.startsWith('SELECT *')){const row=rows.get(key);return {rows:row&&row.role===args[2]?[structuredClone(row)]:[]};}
    if(sql.startsWith('INSERT')){const row=rows.get(key)||{pair_key:args[0],draft_id:args[1],role:args[2],checkpoint:{},stage:'queued'};row.status='working';rows.set(key,row);return {rows:[structuredClone(row)]};}
    if(sql.includes('checkpoint=$5')){Object.assign(rows.get(key),{stage:args[3],checkpoint:JSON.parse(args[4])});}
    if(sql.includes("status='failed'"))rows.get(key).status='failed';
    return {rows:[]};
  };
  return {db:{query,connect:async()=>({query,release(){}})},rows};
}
{
  const {db,rows}=fixture();let release;const wait=new Promise(r=>release=r);let calls=0;
  const make=()=>createStoryLaunchQueue({db,pairKey:()=> 'pair',validate:async()=>{},execute:async({save})=>{calls++;await save('player:A',{completed:true});await wait;rows.get('pair:7').status='ready';}});
  const q=make(),otherProcess=make();
  assert.equal((await q.start('A','7')).status,'working');
  await otherProcess.start('A','7');assert.equal(calls,1,'Duplicate tab/process must share the saved job');
  await assert.rejects(otherProcess.start('A','9'),/ALREADY_RUNNING/);
  release();await q.drain();assert.equal((await q.start('A','7')).status,'ready');assert.equal(calls,1);
  assert.equal(await q.get('B','7'),null,'Job state must be role scoped');
  assert(!Object.hasOwn(publicLaunchJob(rows.get('pair:7')),'checkpoint'),'Private characters/photos never leave through job status');
}
{
  const {db,rows}=fixture();let calls=0;
  const q=createStoryLaunchQueue({db,pairKey:()=> 'pair',validate:async()=>{},execute:async({checkpoint,save})=>{calls++;if(!checkpoint.completed)await save('player:A',{completed:true});throw new Error('provider unreachable');}});
  await q.start('A','7');await q.drain();
  assert.equal(rows.get('pair:7').status,'failed');await q.start('A','7');assert.equal(calls,1,'Failure must not automatically restart paid work');
  assert.equal(rows.get('pair:7').checkpoint.completed,true);
  await q.start('A','7',{resume:true});await q.drain();assert.equal(calls,2);
}
console.log('NOVEL2_STORY_LAUNCH_OK lost_response reload explicit_resume no_paid_retry old_origin_gate concurrency privacy checkpoints');
