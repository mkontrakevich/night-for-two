import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launchFailureCode} from '../src/story-launch.js';
let calls=0,request;
const source=fs.readFileSync(new URL('../src/prose-engine.js',import.meta.url),'utf8').replace(/\r\n?/g,'\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const create=new Function('jsonCompletion','noirBeatPlan','attachNoirScene',source+'\nreturn createStoryBible;')(
 async args=>{calls++;request=args;return {title:'Fixture',canon:{step:1},logline:'Unexpected replacement',world_bible:{place:'Unexpected replacement'},master_plot:[],threads:[],first_scene:{prose:'A neutral fixture passage. '.repeat(250),target_role:'A',primary_interaction:{prompt:'Continue?'}}};},()=>({}),scene=>scene);
const A={passport:{fiction_name:'Fixture A'}},B={passport:{fiction_name:'Fixture B'}};
const blueprint={title:'Fixture',logline:'Source logline',world_bible:{place:'Source setting'},master_plot:[{key:'Source plot'}],threads:['Source thread']};
const result=await create({characters:{A,B},blueprint});
assert.equal(calls,1);
assert.equal(request.responseSchema.properties.first_scene.properties.prose.type,'string');
assert.equal(request.responseSchema.properties.first_scene.properties.prose.minLength,4200,'Provider and publication must agree on the minimum scene length');
assert(request.responseSchema.required.includes('first_scene'));
for(const key of ['player_characters','supporting_characters','story_blueprint','world_bible','master_plot','threads'])assert(!Object.hasOwn(request.user.output,key),'Model must not spend output tokens repeating saved data: '+key);
assert.equal(result.player_characters.A,A);assert.equal(result.player_characters.B,B);
assert.equal(result.logline,blueprint.logline);assert.deepEqual(result.world_bible,blueprint.world_bible);assert.deepEqual(result.master_plot,blueprint.master_plot);assert.deepEqual(result.threads,blueprint.threads);assert(result.first_scene.prose.length>4200);
assert.equal(launchFailureCode(new Error('NOVEL2_AI_JSON_INVALID')),'NOVEL2_AI_JSON_INVALID');
assert.equal(launchFailureCode(new Error('NOVEL2_EDGE_TEXT_502: private provider payload')),'NOVEL2_EDGE_TEXT_502');
assert.equal(launchFailureCode(new Error('arbitrary private error message')),'NOVEL2_LAUNCH_STEP_FAILED');
const withResult=value=>new Function('jsonCompletion','noirBeatPlan','attachNoirScene',source+'\nreturn createStoryBible;')(async()=>value,()=>({}),scene=>scene);
const fallback=await withResult({first_scene:{prose:'Neutral fixture. '.repeat(400)}})({characters:{A,B},blueprint});
assert.equal(fallback.title,blueprint.title,'Saved title must survive an omitted model title');
await assert.rejects(withResult({title:'Fixture'})({characters:{A,B},blueprint}),/NOVEL2_BIBLE_SCENE_MISSING/);
await assert.rejects(withResult({first_scene:{prose:{wrong:'type'}}})({characters:{A,B},blueprint}),/NOVEL2_BIBLE_PROSE_MISSING/);
console.log('FIRST_CHAPTER_CONTRACT_OK compact_output=true saved_cast_preserved=true saved_world_preserved=true safe_error_category=true');

