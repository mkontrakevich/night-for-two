import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {ACTION_SCENES,effectiveAction,actionCard} from '../src/night-actions-core.js';
import {createNightActionsProduct} from '../src/night-actions-product.js';
let html='';
await createNightActionsProduct({pool:{}}).handle({method:'GET',url:'/actions'}, {
  writeHead(){},
  end(body){html=body;}
});
assert.match(html,/Откройте в Telegram/);
new Script(html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'',{filename:'night-actions-inline.js'});
assert.equal(ACTION_SCENES.length,3);
assert.equal(effectiveAction('touch','words'),'words');
assert.equal(effectiveAction('kiss','embrace'),'embrace');
assert.equal(effectiveAction('skip','touch'),'skip');
assert.equal(effectiveAction('touch',null),null);
assert.throws(()=>effectiveAction('closer','touch'),/INVALID/);
for(const [i,scene] of ACTION_SCENES.entries()){
  for(const p of ['words','embrace','kiss','touch']){
    const card=actionCard(i,p,{preferences:[{key:'tempo',value:'slow',confidence:.9}],raw_messages:false});
    assert.equal(card.scene,scene.id);
    assert.ok(card.text.includes('Без спешки'));
    assert.ok(!card.text.includes('raw_messages'));
  }
}
assert.match(actionCard(0,'skip').text,/Ничего объяснять/);
console.log('NIGHT_ACTIONS_PRODUCT_OK scenes=3 private_intersection=true story_anchors=true skip=true');
const {storyActionSnapshot,actionScene,fallbackStoryCard}=await import('../src/night-actions-core.js');
const flow={final:true,history:[{title:'Станция',text:'Они встретились у часов.',raw_messages:['PRIVATE']},{title:'Платформа',text:'Поезд задержался.',director_signal:{secret:'PRIVATE'}}],scene:{title:'Последний поезд',text:'Они решили остаться вместе.',reader_pages:[{text:'PRIVATE'}]}};
const snapshot=storyActionSnapshot(flow,27);
assert.equal(snapshot.source_session_id,27);
assert.equal(snapshot.anchors[0].chapter,'Станция');
assert.equal(actionScene(2,snapshot).chapter,'Последний поезд');
assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
assert.match(fallbackStoryCard(0,'words',snapshot).text,/Станция/);
const {directStoryAction}=await import('../src/night-actions-director.js');
const calls=[];
const generated=await directStoryAction({stage:0,permission:'words',snapshot,relationshipContext:{raw_messages:false,preferences:[]},generate:async request=>{calls.push(request);return calls.length===1?JSON.stringify({title:'Встреча у часов',text:'Встаньте рядом и по очереди скажите, что запомнили в этой сцене. Любой может остановиться без объяснений.'}):JSON.stringify({safe:true})}});
assert.equal(generated.permission,'words');
assert.equal(calls.length,2);
assert.ok(calls.every(x=>x.skipDatabaseContext===true));
assert.ok(!JSON.stringify(calls).includes('PRIVATE'));
const fallback=await directStoryAction({stage:0,permission:'embrace',snapshot,generate:async()=>JSON.stringify({safe:false})});
assert.equal(fallback.permission,'embrace');
console.log('NIGHT_ACTIONS_STORY_CONTEXT_OK whitelist=true safety_gate=true fallback=true');
