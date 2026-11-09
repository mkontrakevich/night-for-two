import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import {assertSceneArtifact,assertBookArtifact} from '../src/pipeline-contract.js';
import {resolveNextDecision,pairDecisionView} from '../src/pair-decision.js';

const connectionString=process.env.NOVEL2_LAUNCH_TEST_DATABASE_URL;
if(!connectionString)throw Error('NIGHT4TWO_TEST_DATABASE_REQUIRED');
const schema='pair_test_'+Date.now(),admin=new pg.Pool({connectionString});
await admin.query(`CREATE SCHEMA ${schema}`);
const db=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:6});
const raw=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const sql=raw.match(/const schema = `([\s\S]*?)`;/)?.[1];assert(sql);
const source=raw.replace(/^import .*;\n/gm,'').replace(/const \{Pool\} = pg;[\s\S]*?(?=const schema =)/,'').replace(/^export /gm,'');
const cfg={ownerId:'fixture-mikhail',partnerId:'fixture-snezha'};
const make=(database=db,config=cfg)=>new Function('db','config','assertSceneArtifact','assertBookArtifact',source+'\nreturn {saveJointTurnChoice,jointTurnChoices,ownJointTurnChoice,appendTurn,advanceBook,withBookPipelineLock};')(database,config,assertSceneArtifact,assertBookArtifact);
const api=make(),pair='fixture-mikhail:fixture-snezha';
const scene=(role,decisionOwner=role)=>({
 chapter_no:1,prose:'A fictional hotel corridor passage with choices. '.repeat(120),
 target_role:role,
 primary_interaction:{type:'free_reply',prompt:'What do you choose?'},
 decision_dependency:{decision_owner:decisionOwner,requires_partner:decisionOwner==='both'||decisionOwner!==role,participation_reason:'Only the required real actor can decide here.',reveal_scope:'private'}
});
try{
 await db.query(sql);
 let book=(await db.query(
  "INSERT INTO novel2_books(pair_key,title,turn_no,active_role,current_scene) VALUES($1,'Pair fixture',1,'A',$2::jsonb) RETURNING *",
  [pair,JSON.stringify(scene('A'))]
 )).rows[0];
 // A is able to make several separate story choices without B being online.
 for(let n=0;n<3;n++){
  const next=resolveNextDecision(scene('B'),'A');
  assert.equal(next.target_role,'A');
  book=await api.advanceBook(book,{scene:next,activeRole:next.target_role});
  assert.equal(book.turn_no,2+n);
 }
 assert.equal(book.active_role,'A');
 // Explicitly B-dependent decision is the first real waiting boundary.
 const handoff=resolveNextDecision({...scene('B'),decision_dependency:{
  decision_owner:'B',requires_partner:true,
  participation_reason:'Only B can decide whether to open the door.',reveal_scope:'private'
 }},'A');
 book=await api.advanceBook(book,{scene:handoff,activeRole:'B'});
 assert.equal(pairDecisionView(book.current_scene,'A').waiting_for,'partner');
 assert.equal(pairDecisionView(book.current_scene,'B').can_reply,true);
 // Independently collected choices for a new shared decision, no overwrite.
 const together=resolveNextDecision({...scene('B'),decision_dependency:{
  decision_owner:'both',requires_partner:true,
  participation_reason:'Both adults must choose the course of action.',reveal_scope:'private'
 }},'B');
 book=await api.advanceBook(book,{scene:together,activeRole:'B'});
 const turn=book.turn_no;
 assert.equal(await api.saveJointTurnChoice(book.id,turn,'A','A checks the letter',''),true);
 assert.equal(await api.saveJointTurnChoice(book.id,turn,'A','A checks the letter',''),false);
 await assert.rejects(api.saveJointTurnChoice(book.id,turn,'A','A opens a different door',''),/CHOICE_CONFLICT/);
 assert.equal((await api.jointTurnChoices(book.id,turn)).length,1);
 assert.equal(await api.ownJointTurnChoice(book.id,turn,'B'),null);
 assert.equal((await api.ownJointTurnChoice(book.id,turn,'A')).reply,'A checks the letter');
 assert.equal(pairDecisionView(book.current_scene,'A',['A']).waiting_for,'partner');
 assert.equal(pairDecisionView(book.current_scene,'B',['A']).can_reply,true);
 const other=make(db,{ownerId:'other-owner',partnerId:'other-partner'});
 assert.deepEqual(await other.jointTurnChoices(book.id,turn),[]);
 assert.equal(await other.ownJointTurnChoice(book.id,turn,'A'),null);
 await assert.rejects(other.saveJointTurnChoice(book.id,turn,'A','cross pair write',''),/CHOICE_STALE/);
 await api.saveJointTurnChoice(book.id,turn,'B','B leaves a note','');
 const answers=await api.jointTurnChoices(book.id,turn);
 assert.deepEqual(answers.map(x=>x.role),['A','B']);
 const replyTurn=turn+1;
 for(const answer of answers)
  await api.appendTurn(book.id,replyTurn,answer.role,'reply',answer.reply,{action_key:answer.action_key,joint_decision:true});
 const history=await db.query('SELECT role,content FROM novel2_turns WHERE book_id=$1 AND turn_no=$2 ORDER BY role',[book.id,replyTurn]);
 assert.deepEqual(history.rows.map(x=>x.role),['A','B']);
 book=await api.advanceBook(book,{scene:resolveNextDecision(scene('B'),'B'),activeRole:'B'});
 assert.equal(book.turn_no,replyTurn);
 assert.deepEqual(await api.jointTurnChoices(book.id,turn),[],'Processed joint decisions are unavailable as current unresolved choices');
 await assert.rejects(api.saveJointTurnChoice(book.id,turn,'A','stale answer',''),/CHOICE_STALE/);
 console.log('NIGHT4TWO_ASYNC_PAIR_POSTGRES_OK solo=3 partner_gate=true two_private_answers=true no_cross_pair=true idempotent=true stale_rejected=true');
}finally{
 await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
