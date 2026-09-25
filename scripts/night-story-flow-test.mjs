import assert from 'node:assert/strict';
import {STORY_ARC,STORY_MAX_CHOICE_STAGE,STORY_PAGE_PLAN,STORY_TOTAL_PAGES,storyArcStage,storyPageCount,storyPageOffset,initialStoryProfile,storyBlueprint,applyStoryOption,mergeStoryProfiles,generateStoryScene,storyProfileToSelection} from '../src/night-story-flow.js';

assert.equal(STORY_ARC.length,10);
assert.equal(storyArcStage(0).key,'prologue');
assert.equal(storyArcStage(9).key,'finale');
assert.equal(STORY_MAX_CHOICE_STAGE,8);
assert.equal(STORY_TOTAL_PAGES,100);
assert.equal(STORY_PAGE_PLAN.reduce((a,b)=>a+b,0),100);
assert.equal(storyPageCount(0),8);
assert.equal(storyPageCount(9),12);
assert.equal(storyPageOffset(9),88);

const romance=initialStoryProfile('romance');
const hardcore=initialStoryProfile('hardcore');
assert.equal(romance.mode,'romance');
assert.equal(hardcore.mode,'hardcore');

const prologue=storyBlueprint('bold',0,initialStoryProfile('bold'));
assert.equal(prologue.length,3);
assert(prologue.every(x=>x.key&&x.intent&&x.meta));

const deeper=applyStoryOption(initialStoryProfile('sensual'),{meta:{level:'bold',permission:'closer',tempo:'direct',leader:'alternating',novelty:'sensory'}},'sensual');
const softer=applyStoryOption(initialStoryProfile('sensual'),{meta:{level:'open',permission:'kiss',tempo:'slow',leader:'mutual',novelty:'familiar'}},'sensual');
const merged=mergeStoryProfiles(deeper,softer,'sensual');
assert.equal(merged.level,'open','Pair merge must use the softer mutually compatible level');
assert.equal(merged.permission,'kiss','Pair merge must use the softer mutually compatible permission');
assert.equal(merged.tempo,'slow','Pair merge must use the slower compatible tempo');

const sel=storyProfileToSelection(merged,'sensual');
assert.equal(sel.version,3);
assert(sel.permissions.includes('kiss'));
assert(!sel.permissions.includes('closer'));

const fake=async req=>{
  const body=JSON.parse(req.messages[1].content),pageCount=Number(body.pageCount)||10;
  const pages=Array.from({length:pageCount},(_,i)=>({id:'p'+(i+1),title:i===0?(body.final?'Финальная глава':'Глава'):'',text:Array.from({length:150},()=>((body.final?'финал':'слово')+(i+1))).join(' '),media:(i===0||i===pageCount-1)?{kind:'image',prompt:'same adult couple, key story beat on book page '+(body.pageOffset+i+1)+', cinematic romantic atmosphere, tasteful non-explicit'}:null}));
  if(body.final)return JSON.stringify({title:'Финал истории',text:'История приходит к общей кульминации и завершает начатую в прологе линию.',visual_prompt:'anonymous adult couple silhouette, candlelight, cinematic close crop',reader_pages:pages});
  return JSON.stringify({
    title:'Первая глава',
    text:'Комната остаётся той же, но расстояние между героями становится меньше. Следующий выбор определит, как именно продолжится эта линия.',
    visual_prompt:'anonymous adult couple, warm dark room, cinematic vertical close crop',
    reader_pages:pages,
    interaction:{kind:'choice',prompt:'Как продолжить?',options:body.blueprint.map(x=>({key:x.key,label:'Продолжить: '+x.key}))}
  });
};
const scene=await generateStoryScene({mode:'bold',stage:0,profile:initialStoryProfile('bold'),history:[],relationshipProfile:{},mutualWishes:[],generate:fake});
assert.equal(scene.final,false);
assert.equal(scene.options.length,3);
assert.equal(scene.options[0].key,prologue[0].key);
assert.equal(scene.reader_pages.length,8);
assert.equal(scene.reader_meta.episode_page_offset,0);
assert.equal(scene.reader_meta.episode_page_total,100);
assert.equal(scene.reader_meta.chapter_page_total,8);
assert.equal(scene.reader_pages.filter(p=>p.media?.prompt).length,2,'Prologue must illustrate only two key story beats instead of every page');
assert(scene.reader_pages.some(p=>!p.media),'Transition pages must remain text-only');

const finale=await generateStoryScene({mode:'bold',stage:9,profile:merged,history:[scene],relationshipProfile:{},mutualWishes:[],generate:fake,final:true});
assert.equal(finale.final,true);
assert.equal(finale.options.length,0);
assert.equal(finale.reader_pages.length,12);
assert.equal(finale.reader_meta.finale,true);
assert.equal(finale.reader_meta.episode_page_offset,88);
assert.equal(finale.reader_meta.episode_page_total,100);
assert.equal(finale.reader_pages.filter(p=>p.media?.prompt).length,2,'Finale must keep only two key illustrations');

console.log('NIGHT_STORY_FLOW_OK arc=true pair_merge=true generated_scene=true finale=true');
