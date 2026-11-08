import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
 sceneFingerprint,narratorShotOffer,publicShotDraft,normalizeFrameNote
} from '../src/shot-draft.js';

const book={id:'42',turn_no:3,current_scene:{
 prose:'Взрослая героиня поднимает глаза от книги у окна.',
 visual_scene:{camera_moment:'Средний план у окна, мягкий свет.'},
 visual_beat:'Взгляд поверх книги'
}};
const sha=sceneFingerprint(book);
assert.match(sha,/^[0-9a-f]{64}$/);
assert.equal(sha,sceneFingerprint(structuredClone(book)));
assert.notEqual(sha,sceneFingerprint({...book,turn_no:4}));
assert.notEqual(sha,sceneFingerprint({...book,current_scene:{...book.current_scene,prose:'Новая сцена'}}));
assert.equal(narratorShotOffer(book.current_scene),'Средний план у окна, мягкий свет.');
assert.match(narratorShotOffer({}),/Рассказчик/);
assert.equal(normalizeFrameNote('  крупный план  '),'крупный план');
assert.throws(()=>normalizeFrameNote({}),/NOVEL2_SHOT_NOTE_INVALID/);
assert.throws(()=>normalizeFrameNote('a'.repeat(901)),/NOVEL2_SHOT_NOTE_INVALID/);
const safe=publicShotDraft({id:'sh1',book_id:42,turn_no:3,status:'draft',offer:'момент',
 frame_note:'свет',revision:2,pair_key:'PRIVATE',scene_sha256:'secret',price_ceiling_usd:20});
assert.equal(safe.frame_note,'свет');
assert(!Object.hasOwn(safe,'pair_key'));
assert(!Object.hasOwn(safe,'scene_sha256'));
assert(!Object.hasOwn(safe,'price_ceiling_usd'));
const source=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const embedded=source.split('<script>')[1]?.split('</script>')[0];
assert(embedded,'Inline reader script missing');
new vm.Script(embedded);
assert.match(source,/id="shotFrameNote"/);
assert.match(source,/id="shotSave"/);
assert.match(source,/id="shotSkip"/);
assert.match(source,/shot\/draft\//);
assert.match(source,/const shotFlow=state\.shot_flow\?\.enabled/);
assert.match(source,/Рассказчик · момент для иллюстрации/);
assert(source.includes("+'</article>'+shotCard+'<div class=\"turnPrompt\">"),'Shot card must be placed after prose and before the reply prompt');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
assert.match(app,/if\(config\.shotFlowEnabled\)\{/);
assert.match(app,/awaiting_shot_approval:true/);
assert(app.indexOf('awaiting_shot_approval:true')<app.indexOf('const previous=await previousVisual'),'Must gate legacy image creation before model generation');
console.log('NIGHT4TWO_V32_SHOT_UNIT_OK free_flow=true, scene_fingerprint=true, ui_syntax=true');
