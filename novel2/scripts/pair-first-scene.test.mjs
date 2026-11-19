import assert from 'node:assert/strict';
import fs from 'node:fs';
import {expandSceneToTarget} from '../src/scene-expansion.js';
import {resolveNextDecision} from '../src/pair-decision.js';
const source=fs.readFileSync(new URL('../src/prose-engine.js',import.meta.url),'utf8')
  .replace(/\r\n?/g,'\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const build=(enabled,generate)=>new Function('jsonCompletion','noirBeatPlan','attachNoirScene','expandSceneToTarget','config','resolveNextDecision',
  source+'\nreturn createStoryBible;')(
    generate,()=>({}),scene=>scene,expandSceneToTarget,{asyncPairEnabled:enabled},resolveNextDecision);
const A={passport:{fiction_name:'Actor A'}},B={passport:{fiction_name:'Actor B'}},blueprint={title:'A pair story',logline:'Neutral'};
const scene=(target,dependency=null)=>({
 prose:'A long fictional opening scene in a coastal hotel. '.repeat(105),
 target_role:target,primary_interaction:{type:'free_reply',prompt:'Your next action?'},
 decision_dependency:dependency
});
async function buildPair({launchRole='A',target='B',dependency=null}={}){
 const create=build(true,async()=>({title:'A pair story',first_scene:scene(target,dependency)}));
 let staged=null;
 const book=await create({characters:{A,B},blueprint,launchRole,onCandidate:async x=>{staged=x}});
 assert(staged);
 assert.equal(book.async_pair_mode,'real_players_v1');
 assert.equal(book.first_scene.target_role,staged.first_scene.target_role);
 return book;
}
const solo=await buildPair();
assert.equal(solo.first_scene.target_role,'A','No forced handoff to an absent player');
assert.equal(solo.first_scene.primary_interaction.prompt,'Что вы предпринимаете дальше?');
const bStarts=await buildPair({launchRole:'B',target:'A'});
assert.equal(bStarts.first_scene.target_role,'B','B can independently start the story');
const realNeed=await buildPair({launchRole:'A',target:'B',dependency:{decision_owner:'B',requires_partner:true,
 participation_reason:'Only the other human may decide to open the locked room',reveal_scope:'private'}});
assert.equal(realNeed.first_scene.target_role,'B');
assert.equal(realNeed.first_scene.decision_dependency.requires_partner,true);
const both=await buildPair({launchRole:'A',target:'B',dependency:{decision_owner:'both',requires_partner:true,
 participation_reason:'The story requires two independent player choices now',reveal_scope:'private'}});
assert.equal(both.first_scene.decision_dependency.decision_owner,'both');
assert.equal(both.first_scene.target_role,'A');
const legacy=await build(false,async()=>({title:'Legacy',first_scene:scene('B')}))({characters:{A,B},blueprint});
assert.equal(legacy.async_pair_mode,null);
assert.equal(legacy.first_scene.target_role,'B','Original default behaviour remains unchanged');
console.log('NIGHT4TWO_PAIR_FIRST_SCENE_OK launch_A=true launch_B=true justified_handoff=true joint=true legacy=true');
