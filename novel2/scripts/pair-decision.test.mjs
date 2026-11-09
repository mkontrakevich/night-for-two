import assert from 'node:assert/strict';
import {resolveNextDecision,decisionOwner,pairDecisionView,publicDecisionPrompt,DECISION_POLICY_VERSION} from '../src/pair-decision.js';
const base=(target='B')=>({target_role:target,primary_interaction:{prompt:'Выберите продолжение'},prose:'A scene',visual_scene:{}});
let scene=base('B');
// An accidental alternation never takes control from the solo player.
for(let i=0;i<3;i++){
 scene=resolveNextDecision(scene,'A');assert.equal(scene.target_role,'A');
 assert.equal(scene.decision_dependency.decision_owner,'A');
}
assert.equal(scene.decision_dependency.version,DECISION_POLICY_VERSION);
assert.equal(scene.primary_interaction.prompt,'Выберите продолжение');
// Explicit participant-dependent decision waits for real B, not B's online flag.
const waiting=resolveNextDecision({...base('B'),decision_dependency:{decision_owner:'B',requires_partner:true,participation_reason:'Только Снежа может выбрать, откроет ли она дверь',reveal_scope:'private'}},'A');
assert.equal(decisionOwner(waiting),'B');
assert.equal(waiting.target_role,'B');
assert.equal(pairDecisionView(waiting,'A').can_reply,false);
assert.equal(pairDecisionView(waiting,'A').waiting_for,'partner');
assert.equal(pairDecisionView(waiting,'B').can_reply,true);
assert.equal(publicDecisionPrompt(waiting,'A').primary_interaction.prompt,'');
assert.equal(publicDecisionPrompt(waiting,'B').primary_interaction.prompt,'Выберите продолжение');
const reverse=resolveNextDecision({...base('A'),decision_dependency:{decision_owner:'A',requires_partner:true,participation_reason:'Только Михаил решает, останется ли он в коридоре'}},'B');
assert.equal(pairDecisionView(reverse,'B').waiting_for,'partner');
assert.equal(pairDecisionView(reverse,'A').can_reply,true);
// Joint decisions are independent; never reveal the other answer before both.
const both=resolveNextDecision({...base('B'),decision_dependency:{decision_owner:'both',requires_partner:true,participation_reason:'Оба игрока должны определить решение независимо',reveal_scope:'private'}},'A');
assert.equal(decisionOwner(both),'both');
assert.equal(pairDecisionView(both,'A',[]).can_reply,true);
assert.equal(pairDecisionView(both,'B',[]).can_reply,true);
assert.equal(pairDecisionView(both,'A',['A']).can_reply,false);
assert.equal(pairDecisionView(both,'B',['A']).can_reply,true);
assert.equal(pairDecisionView(both,'A',['A']).waiting_for,'partner');
assert.equal(publicDecisionPrompt(both,'A',['A']).primary_interaction.prompt,'');
assert.equal(pairDecisionView(both,'A',['B']).can_reply,true);
// No implied partner handoff without its required predicate.
for(const dependency of [
 {decision_owner:'B',requires_partner:false,participation_reason:'B should choose now'},
 {decision_owner:'B',requires_partner:true,participation_reason:'short'},
 {decision_owner:'both',requires_partner:false,participation_reason:'Both must decide an important part'}
]){
 const safe=resolveNextDecision({...base('B'),decision_dependency:dependency},'A');
 assert.equal(safe.target_role,'A');
 assert.equal(safe.decision_dependency.requires_partner,false);
}
const final={...waiting,noir_progress:{finale:true}};
assert.equal(pairDecisionView(final,'B').can_reply,false);
assert.equal(pairDecisionView(final,'A').waiting_for,null);
console.log('NIGHT4TWO_ASYNC_PAIR_POLICY_OK solo=3 handoff=true mirror=true joint_private=true');
