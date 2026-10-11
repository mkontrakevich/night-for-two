import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  NOIR_MAX_SCENES,noirBeatPlan,noirPartnerPlan,noirTrialPlan,attachNoirScene
} from '../src/noir-director.js';

const read=(file)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
for(const filename of ['public/noir-experience.js','public/noir-host.js']){
  assert.doesNotThrow(()=>new vm.Script(read(filename),{filename}));
}
const app=read('src/app.js');
const html=read('public/index.html');
const host=read('public/noir-host.js');
const experience=read('public/noir-experience.js');
const prose=read('src/prose-engine.js');
const visual=read('src/visual-engine.js');
const skill=fs.readFileSync(new URL('../../skills/novel2-noir-host/SKILL.md',import.meta.url),'utf8');

assert.ok(html.includes('/novel2/noir-host.js?v=1'),'Host script must load');
assert.ok(html.includes('/novel2/noir-experience.js?v=1'),'Reader script must load');
assert.ok(app.includes("'/novel2/noir-host.js'"),'Host route must be present');
assert.ok(app.includes("'/novel2/noir-host.css'"),'Host CSS route must be present');
assert.ok(host.includes("Мне есть 18 лет"),'Adult affirmative opt-in must be offered');
assert.ok(host.includes("nativeMainMenu()"),'Menu exit must remain available');
assert.ok(host.includes("nativeCharacterDetail(role)"),'Host casting must use existing Actor Sheet');
assert.ok(host.includes("novel2_host_introduced"),'Return guests must not repeat onboarding');
assert.ok(html.includes('novel2HostCreativeBrief'), 'Host premise must reach story architect');
assert.ok(app.includes("NOVEL2_OTHER_PLAYER_PRIVATE"),'Other player card routes must be access controlled');
assert.ok(app.includes("otherRole=auth.role"),'Other player state must be anonymized');
assert.ok(visual.includes('MYSTERY LOCK'), 'SD imagery must preserve mystery');
assert.ok(prose.includes('noir_trial:s.noir_trial'),'Generated trial must survive scene cleaning');
assert.ok(experience.includes("noir_trial")&&experience.includes("noir_trial_decline"),'Plot trial needs accept/softer/decline');
assert.ok(skill.includes('skills/sd-story-illustration/SKILL.md')&&skill.includes('skills/night-erotic-serial-novelist/SKILL.md'));

assert.equal(noirPartnerPlan(noirBeatPlan(1)).phase,'anonymous');
assert.equal(noirPartnerPlan(noirBeatPlan(6)).phase,'clues');
assert.equal(noirPartnerPlan(noirBeatPlan(12)).phase,'approach');
assert.equal(noirPartnerPlan(noirBeatPlan(20)).phase,'fictional_reveal');
assert.equal(noirPartnerPlan(noirBeatPlan(1)).allow_real_guest_identity_reveal,false);
assert.equal(noirTrialPlan(noirBeatPlan(2)).available,true);
assert.equal(noirTrialPlan(noirBeatPlan(3)).available,false);
const scene=attachNoirScene({
  prose:'В полумраке на столе лежал конверт.\n\nГерой коснулся печати.',
  noir_trial:{
    title:'Письмо без подписи',
    invitation:'Вы можете оставить на бумаге одну фразу для другого героя.',
    softer_option:'Просто посмотреть на письмо',
    decline_option:'Положить письмо обратно'
  },
  primary_interaction:{prompt:'Что вы сделаете?'}
},noirBeatPlan(2));
assert.equal(scene.noir_trial.opt_in,true);
assert.match(scene.noir_trial.decline_option,/письмо/);
assert.ok(scene.visual_after_paragraph>=1);
assert.equal(noirBeatPlan(NOIR_MAX_SCENES+1).finale,true);
console.log('NOVEL2_SECRET_HOST_CONTRACT_OK');
