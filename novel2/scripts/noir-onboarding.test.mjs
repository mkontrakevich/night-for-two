import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const host=fs.readFileSync(new URL('../public/noir-host.js',import.meta.url),'utf8');
const director=fs.readFileSync(new URL('../src/noir-director.js',import.meta.url),'utf8');
const reader=fs.readFileSync(new URL('../public/noir-experience.js',import.meta.url),'utf8');

assert.equal((html.match(/<script src="\/novel2\/noir-host\.js/g)||[]).length,1,'single host');
assert(!html.includes('<script src="/novel2/noir-gateway.js'),'no overlapping entrance');
assert(!html.includes('<link rel="stylesheet" href="/novel2/noir-gateway.css'),'no old gateway CSS');
assert(host.includes('actorConfirmed()&&step===3'),'user must approve actor before moving on');
assert(host.includes('Подтверждаю 18+ и согласие'),'entrance consent');
assert(host.includes("read('novel2_host_mood'"),'mood is remembered');
assert(host.includes('nativeCharacterDetail(role)'),'actor screen handoff');
assert(host.includes('hostPlaceField'),'guest location question');
assert(host.includes('lobby/world/start'),'location-driven generation');
assert(host.includes("begin.textContent='Войти под завесу'"),'existing players enter host via functional CTA');
assert(host.includes('Реальные данные других гостей не раскрываются'),'never disclose real guest automatically');
assert(host.includes('Генерация звука отложена'),'deferred audio only');
assert(reader.includes('data-trial-choice'),'opt-in narrative assignments');
assert(reader.includes("noir_trial_decline"),'skip option');
assert(reader.includes("noir_trial_soft"),'softer choice');
assert(reader.includes("noir_trial_accept"),'accept choice');
assert(director.includes("allow_real_guest_identity_reveal:false"),'private identity never auto revealed');
assert(director.includes("NOIR_MAX_SCENES"),'bounded narrative');
console.log('NOVEL2_SECRET_HOST_ONBOARDING_OK entrance=single actor=approved partner=fictional quests=opt-in audio=deferred');
