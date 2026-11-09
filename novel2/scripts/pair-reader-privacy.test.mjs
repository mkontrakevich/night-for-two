import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {decisionOwner,pairDecisionView,publicDecisionPrompt} from '../src/pair-decision.js';
const app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
const a=app.indexOf('function publicStoryDraft('),b=app.indexOf('async function driveAiTurns(',a);
assert(a>=0&&b>a);
let answers=[{role:'A',reply:'A PRIVATELY chooses to examine the letter',action_key:''}];
const config={asyncPairEnabled:true};
const {publicState}=vm.runInNewContext(app.slice(a,b)+'\n({publicState})',{
 config,decisionOwner,pairDecisionView,publicDecisionPrompt,
 characterSummary:async()=>({ready:true}),buildBaseActorCard:()=>({role:'own_only'}),
 castCharacterSummary:async x=>({slot_key:x.slot_key,interactive_role:x.interactive_role}),
 hasPersistentHumanIdentity:()=>true,isAiControlled:()=>false,
 jointTurnChoices:async()=>answers,
 pendingReply:async()=>null
});
const book={
 id:51,title:'Private novel',turn_no:12,chapter_no:3,active_role:'A',
 story_bible:{async_pair_mode:'real_players_v1'},
 current_scene:{
  prose:'Shared known fictional setting with two adults.',
  target_role:'A',
  primary_interaction:{type:'free_reply',prompt:'How should the second participant choose?'},
  decision_dependency:{decision_owner:'both',requires_partner:true,
   reveal_scope:'private',participation_reason:'PRIVATE REASON not for a non-answering player'},
  optional_actions:[{key:'accept',label:'Proceed'}]
 }
};
const ids={A:{approved:true,identity_lock:'A',profile:{}},B:{approved:true,identity_lock:'B',profile:{}}};
const cast=[{interactive_role:'A',slot_key:'A'},{interactive_role:'B',slot_key:'B'}];
const aa=await publicState(book,{role:'A'},ids,cast);
const bb=await publicState(book,{role:'B'},ids,cast);
assert.equal(aa.can_reply,false,'A already answered');
assert.equal(aa.pending_reply.reply,answers[0].reply);
assert.equal(aa.async_pair.waiting_for,'partner');
assert.equal(bb.can_reply,true,'B can decide independently, regardless of A presence');
assert.equal(bb.pending_reply,null);
assert.equal(bb.scene.primary_interaction.prompt,book.current_scene.primary_interaction.prompt);
assert.doesNotMatch(JSON.stringify(bb),/PRIVATELY chooses|PRIVATE REASON/);
assert.equal(bb.cast.length,1);assert.equal(bb.cast[0].interactive_role,'B');
answers=[...answers,{role:'B',reply:'B makes an independent decision',action_key:''}];
const resume=await publicState(book,{role:'A'},ids,cast);
assert.equal(resume.can_reply,true,'A can retry a persisted joint continuation after a lost model response');
assert.equal(resume.pending_reply.reply,answers[0].reply);
assert.doesNotMatch(JSON.stringify(resume),/B makes an independent decision/);
book.current_scene={
 prose:'A known corridor.',target_role:'B',primary_interaction:{prompt:'Private prompt to B'},
 decision_dependency:{decision_owner:'B',requires_partner:true,
 reveal_scope:'private',participation_reason:'Private plot reason reserved for B'}
};
const pa=await publicState(book,{role:'A'},ids,cast);
assert.equal(pa.can_reply,false);
assert.equal(pa.scene.primary_interaction.prompt,'');
assert.equal(pa.scene.decision_dependency.participation_reason,'');
assert.equal(pa.async_pair.waiting_for,'partner');
assert.doesNotMatch(JSON.stringify(pa),/Private prompt to B|Private plot reason/);
assert.match(html,/pair.enabled/);
assert.match(html,/if\(!pair.enabled\)void loadVisual\(\)/,'No paid automatic illustrations during async-pair scenes');
assert.match(html,/checkPartnerReply/);
config.asyncPairEnabled=false;
const legacy=await publicState(book,{role:'B'},ids,cast);
assert.equal(legacy.async_pair,null);
assert.equal(legacy.can_reply,true);
console.log('NIGHT4TWO_PAIR_PUBLIC_PRIVACY_OK offline_wait=true two_private_answers=true idempotent_resume=true no_image_autoplay=true legacy_unchanged=true');
