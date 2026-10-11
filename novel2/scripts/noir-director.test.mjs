import assert from 'node:assert/strict';
import {
  noirBeatPlan,noirPartnerPlan,noirTrialPlan,normalizeNoirTrial,
  attachNoirScene,cleanNoirAnalysis
} from '../src/noir-director.js';

assert.deepEqual([noirBeatPlan(1).episode,noirBeatPlan(1).beat],[1,1]);
assert.deepEqual([noirBeatPlan(10).episode,noirBeatPlan(10).beat],[2,5]);
assert.equal(noirBeatPlan(31).finale,true);
assert.equal(noirPartnerPlan(noirBeatPlan(1)).phase,'anonymous');
assert.equal(noirPartnerPlan(noirBeatPlan(9)).phase,'clues');
assert.equal(noirPartnerPlan(noirBeatPlan(13)).phase,'approach');
assert.equal(noirPartnerPlan(noirBeatPlan(16)).phase,'fictional_reveal');
assert.equal(noirPartnerPlan(noirBeatPlan(31)).allow_real_guest_identity_reveal,false);
assert.equal(noirTrialPlan(noirBeatPlan(2)).available,true);
assert.equal(noirTrialPlan(noirBeatPlan(4)).available,true);
assert.equal(noirTrialPlan(noirBeatPlan(3)).available,false);
assert.equal(noirTrialPlan(noirBeatPlan(31)).available,false);
const trial={title:'Тайное приглашение',invitation:'Оставить записку с обещанием.',
 intensity:'bold',softer_option:'Ответить осторожно',decline_option:'Отказаться без последствий'};
assert.equal(normalizeNoirTrial(trial,noirBeatPlan(1)),null);
const scene=attachNoirScene({
  chapter_no:1,prose:'Чей-то голос.\n\nЗа дверью тихо.\n\nНаступает пора решения.',
  primary_interaction:{type:'free_reply',prompt:'Что ответить?'},
  optional_actions:[{key:'knock',label:'Постучать'}],
  noir_trial:trial
},noirBeatPlan(2));
assert.equal(scene.noir_progress.partner_reveal_phase,'anonymous');
assert.equal(scene.noir_progress.novel_sound_status,'deferred');
assert.equal(scene.optional_actions.length,3);
assert.deepEqual(scene.optional_actions.map(x=>x.key),
 ['noir_trial_accept','noir_trial_soft','noir_trial_decline']);
assert.equal(scene.noir_trial.opt_in,true);
const finale=attachNoirScene({prose:'Финал',noir_trial:trial},noirBeatPlan(31));
assert.equal(finale.optional_actions.length,0);
assert.equal(finale.primary_interaction.type,'none');
assert.equal(finale.noir_trial,null);
assert.equal(finale.noir_progress.finale,true);
assert.equal(cleanNoirAnalysis({intent:'  сделать  шаг  '}).intent,'сделать шаг');
console.log('NOVEL2_NOIR_DIRECTOR_OK phases=4 episodes=6 consent=explicit finale=finite');
