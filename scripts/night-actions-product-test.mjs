import assert from 'node:assert/strict';
import {ACTION_SCENES,effectiveAction,actionCard} from '../src/night-actions-core.js';
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
