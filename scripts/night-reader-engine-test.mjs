import assert from 'node:assert/strict';
import {
  NIGHT_EPISODE_MIN_PAGES,
  NIGHT_EPISODE_MAX_PAGES,
  buildEpisodeReader,
  readerGateState,
  setReaderProgress,
  episodePageBudget
} from '../src/night-reader-engine.js';
import {ROOM17_STORY_BIBLE} from '../src/night-demo-room17.js';

assert.equal(NIGHT_EPISODE_MIN_PAGES,10);
assert.equal(NIGHT_EPISODE_MAX_PAGES,20);
assert.equal(ROOM17_STORY_BIBLE.reader_plan.target_pages,14);
assert.equal(ROOM17_STORY_BIBLE.reader_plan.interaction_anchors.length,3);

const pages=Array.from({length:14},(_,i)=>({
  id:'p'+(i+1),
  kind:'prose',
  title:i===0?'Начало':'',
  text:Array.from({length:210},()=>`слово${i+1}`).join(' '),
  interaction_anchor:[3,7,12].includes(i)?['key','keeper','room17'][[3,7,12].indexOf(i)]:null,
  media:i===5?{kind:'image',prompt:'cinematic hotel corridor',status:'planned'}:null
}));
let reader=buildEpisodeReader({episodeId:'room17',title:'Комната №17',pages,targetPages:14,prologue:{text:'Пролог отдельно.'},epilogue:{text:'Продолжение следует…'}});
assert.equal(reader.page_count,14);
assert.equal(reader.prologue.text,'Пролог отдельно.');
assert.equal(reader.epilogue.text,'Продолжение следует…');

reader=setReaderProgress(reader,'male_player',3);
let gate=readerGateState(reader,'male_player');
assert.equal(gate.blocked,true);
assert.equal(gate.interaction_anchor,'key');
assert.equal(gate.can_next,false);

reader=setReaderProgress(reader,'female_player',5);
assert.equal(reader.progress.female_player,5);
assert.equal(reader.pages[5].media.kind,'image');

const budget=episodePageBudget({completedPages:4,targetPages:14,remainingBeats:3});
assert.equal(budget.remaining,10);
assert.equal(budget.recommended_next,4);

assert.throws(()=>buildEpisodeReader({pages:pages.slice(0,9)}),/PAGE_COUNT_INVALID/);
assert.throws(()=>buildEpisodeReader({pages:[...pages,...pages.slice(0,7)]}),/PAGE_COUNT_INVALID/);

console.log('NIGHT_READER_ENGINE_OK pages=14 gates=3 media=true resume=true');
