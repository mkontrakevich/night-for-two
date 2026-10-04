import assert from 'node:assert/strict';
import {Script,createContext} from 'node:vm';
import {ACTION_SCENES,effectiveAction,actionCard} from '../src/night-actions-core.js';
import {createNightActionsProduct} from '../src/night-actions-product.js';
let html='';
await createNightActionsProduct({pool:{}}).handle({method:'GET',url:'/actions'}, {
  writeHead(){},
  end(body){html=body;}
});
assert.match(html,/Откройте в Telegram/);
const clientScript=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const parsedScript=new Script(clientScript,{filename:'night-actions-inline.js'});
const requests=[];
const origin='https://night42.kontrakevich.workers.dev';
const embeddedApp={innerHTML:'',insertAdjacentHTML(){}};
const child={Telegram:{WebApp:{initData:''}}};
child.parent={location:{origin},Telegram:{WebApp:{initData:'signed-test-context'}}};
parsedScript.runInContext(createContext({
  window:child,location:{origin,hostname:'night42.kontrakevich.workers.dev',search:''},
  document:{querySelector:()=>embeddedApp,querySelectorAll:()=>[]},URLSearchParams,
  fetch:async (url,options)=>{requests.push({url,options});return {ok:false,json:async()=>({error:'TEST_STOP'})};}
}));
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests[0]?.url,'/actions/api/state');
assert.equal(requests[0]?.options.headers['x-telegram-init-data'],'signed-test-context');
const waitingApp={innerHTML:'',insertAdjacentHTML(){}};
const waitingButton={onclick:null};
parsedScript.runInContext(createContext({
  window:child,location:{origin,hostname:'night42.kontrakevich.workers.dev',search:''},
  document:{querySelector:selector=>selector==='#app'?waitingApp:selector==='#edit'?waitingButton:null,querySelectorAll:()=>[]},URLSearchParams,
  setTimeout:()=>{},
  fetch:async()=>({ok:true,json:async()=>({stage:0,total:3,source:'room17_demo',scene:ACTION_SCENES[0],phase:'waiting',my_choice:'words',finished:false})})
}));
await new Promise(resolve=>setImmediate(resolve));
assert.match(waitingApp.innerHTML,/Партнёру нужно открыть «Действия»/);
assert.match(waitingApp.innerHTML,/Изменить приватный выбор/);
waitingButton.onclick();
assert.match(waitingApp.innerHTML,/data-choice="skip"/);
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
const flow={final:false,history:[{title:'Станция',text:'Они встретились у часов.',raw_messages:['PRIVATE']},{title:'Платформа',text:'Поезд задержался.',director_signal:{secret:'PRIVATE'}}],scene:{title:'Последний поезд',text:'Они решили остаться вместе.',reader_pages:[{text:'PRIVATE'}]}};
const snapshot=storyActionSnapshot(flow,27);
assert.equal(snapshot.source_session_id,27);
assert.equal(snapshot.anchors[0].chapter,'Станция');
assert.equal(actionScene(2,snapshot).chapter,'Последний поезд');
assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
assert.match(fallbackStoryCard(0,'words',snapshot).text,/Станция/);
const {directStoryAction}=await import('../src/night-actions-director.js');
const calls=[];
const generated=await directStoryAction({stage:0,permission:'words',snapshot,relationshipContext:{raw_messages:false,preferences:[]},generate:async request=>{calls.push(request);return calls.length===1?JSON.stringify({practice:'compliment',mechanic:'role_lead',title:'Встреча у часов',text:'По очереди скажите одну точную фразу от лица героя о том, что изменилось в этой сцене. Второй отвечает своей репликой; любой может остановиться без объяснений.'}):JSON.stringify({safe:true})}});
assert.equal(generated.permission,'words');
assert.equal(calls.length,2);
assert.ok(calls.every(x=>x.skipDatabaseContext===true));
assert.ok(!JSON.stringify(calls).includes('PRIVATE'));
const fallback=await directStoryAction({stage:0,permission:'embrace',snapshot,generate:async()=>JSON.stringify({safe:false})});
assert.equal(fallback.permission,'embrace');
console.log('NIGHT_ACTIONS_STORY_CONTEXT_OK whitelist=true safety_gate=true fallback=true');

// One shared session: both participants can revise consent without exposing the other's choice.
const session={id:1,stage:0,status:'active',story_snapshot:{}};
const choices=new Map();
let savedCard=null;
const pool={async query(sql,args=[]){
  if(sql.startsWith('CREATE TABLE')||['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('SELECT * FROM night_actions_sessions'))return {rows:[session]};
  if(sql.startsWith('SELECT actor,permission,finished')||sql.startsWith('SELECT actor,permission FROM'))return {rows:[...choices.values()].filter(x=>x.stage===args[1])};
  if(sql.startsWith('SELECT actor FROM night_actions_choices'))return {rows:[...choices.values()].filter(x=>x.stage===args[1]).map(x=>({actor:x.actor}))};
  if(sql.startsWith('SELECT finished FROM night_actions_choices'))return {rows:[...choices.values()].filter(x=>x.stage===args[1]).map(x=>({finished:x.finished}))};
  if(sql.startsWith('INSERT INTO night_actions_choices')){choices.set(args[1]+':'+args[2],{stage:args[1],actor:args[2],permission:args[3],finished:false});return {rows:[]};}
  if(sql.startsWith('UPDATE night_actions_choices SET finished=false')){for(const x of choices.values())if(x.stage===args[1])x.finished=false;return {rows:[]};}
  if(sql.startsWith('UPDATE night_actions_choices SET finished=true')){choices.get(args[1]+':'+args[2]).finished=true;return {rows:[]};}
  if(sql.startsWith('SELECT stage,permission,card FROM night_actions_cards'))return {rows:[]};
  if(sql.startsWith('SELECT permission,card FROM night_actions_cards'))return {rows:savedCard?[savedCard]:[]};
  if(sql.startsWith('DELETE FROM night_actions_cards')){savedCard=null;return {rows:[]};}
  if(sql.startsWith('INSERT INTO night_actions_cards')){savedCard={permission:args[2],card:JSON.parse(args[3])};return {rows:[savedCard]};}
  if(sql.startsWith('UPDATE night_actions_sessions SET stage=stage+1')){session.stage++;session.status=session.stage>=args[1]?'complete':'active';return {rows:[]};}
  throw Error('Unexpected SQL '+sql.slice(0,90));
},async connect(){return {query:(...args)=>pool.query(...args),release(){}}}};
const product=createNightActionsProduct({pool});
assert.equal((await product.state('owner')).phase,'choose');
assert.equal((await product.choose('owner','kiss',0)).phase,'waiting');
assert.equal((await product.choose('owner','embrace',0)).my_choice,'embrace');
const partnerState=await product.choose('partner','words',0);
assert.equal(partnerState.phase,'action');
assert.equal(partnerState.card.permission,'words');
assert.equal(partnerState.my_choice,'words');
assert.equal(JSON.stringify(partnerState).includes('embrace'),false,'partner must not see owner consent');
assert.equal((await product.choose('owner','skip',0)).card.permission,'skip');
assert.equal((await product.state('partner')).card.permission,'skip','revocation must reach the partner');
assert.equal((await product.choose('owner','touch',0)).card.permission,'words','regenerated card must obey both choices');
assert.equal((await product.finish('owner',0)).phase,'waiting_finish');
assert.equal((await product.finish('partner',0)).stage,1);
assert.equal((await product.choose('owner','kiss',0)).phase,'choose','stale tap must not affect next scene');
console.log('NIGHT_ACTIONS_PAIR_FLOW_OK revision=true revocation=true privacy=true stage_guard=true');
