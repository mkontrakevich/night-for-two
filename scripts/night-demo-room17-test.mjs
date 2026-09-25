import assert from 'node:assert/strict';
import {
  ROOM17_PHYSICAL_SCENE_COUNT,
  ROOM17_SCENES,
  ROOM17_STORY_BIBLE,
  newRoom17Gate,
  submitRoom17Intent,
  submitRoom17Intensity,
  attachRoom17Preview,
  submitRoom17Acceptance,
  resolveRoom17LiveScene,
  replanRoom17,
  room17RoleBriefs
} from '../src/night-demo-room17.js';

assert.equal(ROOM17_PHYSICAL_SCENE_COUNT,3);
assert.equal(ROOM17_SCENES.length,3);
assert.equal(ROOM17_STORY_BIBLE.finale.card,'Продолжение следует…');

const role2=room17RoleBriefs(1);
assert.equal(role2.male_player.id,'viktor');
assert.equal(role2.female_player.id,'eva');
assert.equal(ROOM17_SCENES[1].role_switch.from,'mark');
assert.equal(ROOM17_SCENES[1].role_switch.to,'viktor');

let gate=newRoom17Gate(0);
gate=submitRoom17Intent(gate,'male_player','interact');
assert.equal(gate.phase,'intent');
gate=submitRoom17Intent(gate,'female_player','interact');
assert.equal(gate.phase,'intensity');
gate=submitRoom17Intensity(gate,'male_player','high');
gate=submitRoom17Intensity(gate,'female_player','medium');
assert.equal(gate.phase,'generating');
assert.equal(gate.intensity.effective,'medium');

gate=attachRoom17Preview(gate,{title:'Ключ',literary_text:'Достаточно длинное литературное описание сцены для проверки контракта превью.',interaction_summary:'Совместная сцена',roles:{}});
assert.equal(gate.phase,'acceptance');
gate=submitRoom17Acceptance(gate,'male_player','accept');
assert.equal(gate.phase,'acceptance');
gate=submitRoom17Acceptance(gate,'female_player','accept');
assert.equal(gate.phase,'live');
gate=resolveRoom17LiveScene(gate,'completed');
assert.equal(gate.phase,'resolved');
assert.equal(gate.outcome.next,'keeper');

let decline=newRoom17Gate(1);
decline=submitRoom17Intent(decline,'female_player','decline');
assert.equal(decline.phase,'replan');
decline=replanRoom17(decline);
assert.equal(decline.phase,'resolved');
assert.equal(decline.outcome.direct,false);
assert.equal(decline.outcome.clue,'photo_false_lead_then_west_wing');

let keeper=newRoom17Gate(1);
keeper=submitRoom17Intent(keeper,'male_player','interact');
keeper=submitRoom17Intent(keeper,'female_player','interact');
keeper=submitRoom17Intensity(keeper,'male_player','high');
keeper=submitRoom17Intensity(keeper,'female_player','medium');
keeper=attachRoom17Preview(keeper,{title:'Хранитель',literary_text:'Достаточно длинное литературное описание сцены для проверки контракта превью.',interaction_summary:'Совместная сцена',roles:{}});
keeper=submitRoom17Acceptance(keeper,'male_player','accept');
keeper=submitRoom17Acceptance(keeper,'female_player','accept');
keeper=resolveRoom17LiveScene(keeper,'completed');
assert.equal(keeper.outcome.direct,false);
assert.equal(keeper.outcome.clue,'photo_false_lead_then_west_wing');

console.log('NIGHT_ROOM17_DEMO_OK scenes=3 role_switch=true gate=true replan=true');
