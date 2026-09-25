import assert from 'node:assert/strict';
import {NIGHT_V2_PACKS,NIGHT_V2_COUPONS,nightV2Pack} from '../src/night-for-two-v2-catalog.js';
import {negotiateNightV2,resolveNightV2Match,adjustNightV2Intensity,leaderForRound,roundPhase,availableNightV2Packs,chooseNightV2Round,resolveNightV2FinalChoice,publicNightV2State,nightV2CatalogSummary,NIGHT_V2_INTIMATE_PERMISSIONS,NIGHT_V2_NIGHT_PACKS} from '../src/night-for-two-v2-game.js';

assert.equal(NIGHT_V2_PACKS.length,13,'Expected 13 curated source packs');
assert.equal(NIGHT_V2_PACKS.reduce((sum,pack)=>sum+pack.tasks.length,0),98,'Expected 98 original curated source tasks');
assert.ok(NIGHT_V2_COUPONS.length>=6,'Expected a separate coupon mechanic');
assert.equal(nightV2Pack('romance')?.length,14);
const keys=new Set();
for(const pack of NIGHT_V2_PACKS){
  assert.equal(pack.tasks.length,pack.length,`Pack length mismatch: ${pack.key}`);
  assert.ok(pack.description?.length>10,`Pack description missing: ${pack.key}`);
  for(const task of pack.tasks){
    assert.ok(task.key&&task.title&&task.text,`Incomplete task in ${pack.key}`);
    assert.ok(!keys.has(task.key),`Duplicate task key: ${task.key}`);keys.add(task.key);
    assert.ok(task.heat>=1&&task.heat<=5,`Bad heat in ${task.key}`);
    assert.ok(Array.isArray(task.requires),`Permissions missing in ${task.key}`);
    assert.ok(task.text.length>=40,`Task is too thin: ${task.key}`);
  }
}

const negotiated=negotiateNightV2(
  {level:'hot',permissions:['words','embrace','kiss','touch','massage','closer']},
  {level:'bold',permissions:['words','embrace','kiss','touch']}
);
assert.equal(negotiated.level,'bold');
assert.equal(negotiated.ceiling,1);
assert.deepEqual(negotiated.permissions,['words','embrace','kiss','touch']);

assert.equal(resolveNightV2Match('yes','yes'),'yes');
assert.equal(resolveNightV2Match('yes','maybe'),'maybe');
assert.equal(resolveNightV2Match('maybe','maybe'),'maybe');
assert.equal(resolveNightV2Match('yes','no'),'no');
assert.equal(resolveNightV2Match('no','yes'),'no');

assert.equal(adjustNightV2Intensity({current:1,ceiling:2,a:'up',b:'up'}),2);
assert.equal(adjustNightV2Intensity({current:2,ceiling:2,a:'same',b:'down'}),1);
assert.equal(adjustNightV2Intensity({current:1,ceiling:2,a:'up',b:'same'}),1);
assert.equal(adjustNightV2Intensity({current:0,ceiling:0,a:'up',b:'up'}),0);

assert.equal(leaderForRound(0),'a');
assert.equal(leaderForRound(1),'b');
assert.equal(roundPhase('matching'),'match');
assert.equal(roundPhase('active'),'challenge');
assert.equal(roundPhase('feedback'),'feedback');
assert.equal(roundPhase('done'),'complete');

const tenderPacks=availableNightV2Packs({level:0,permissions:['words','embrace','kiss','touch','massage','closer']});
assert.ok(tenderPacks.some(pack=>pack.key==='tender'));
assert.ok(tenderPacks.every(pack=>NIGHT_V2_NIGHT_PACKS.has(pack.key)),'Only dedicated Night packs may be offered');
assert.ok(!tenderPacks.some(pack=>pack.key==='naughty'),'Highest-intensity pack must not be offered at tender level');
const hotPacks=availableNightV2Packs({level:2,permissions:['words','embrace','kiss','touch','massage','closer']});
assert.ok(hotPacks.some(pack=>pack.key==='naughty'));
assert.equal(availableNightV2Packs({level:2,permissions:['words','embrace']}).length,0,'Night must not offer non-physical scenarios');

const tender=chooseNightV2Round({packKey:'tender',roundIndex:0,level:0,permissions:['embrace','kiss','touch','massage','words'],usedKeys:[]});
assert.equal(tender.packKey,'tender');
assert.ok(tender.heat>=2&&tender.heat<=2);
assert.ok(tender.requires.some(item=>NIGHT_V2_INTIMATE_PERMISSIONS.has(item)),'Night task must require physical intimacy permission');
assert.ok(tender.shared_task?.text);
assert.ok(tender.role_a?.text&&tender.role_b?.text);
assert.equal(tender.leader,'a');

const naughty=chooseNightV2Round({packKey:'naughty',roundIndex:0,level:2,permissions:['words','embrace','kiss','touch','massage','closer'],usedKeys:[]});
assert.equal(naughty.packKey,'naughty');
assert.ok(naughty.heat>=3);

const permissionsGate=chooseNightV2Round({packKey:'acrobatics',roundIndex:0,level:2,permissions:['words'],usedKeys:[]});
assert.equal(permissionsGate,null,'Pack must not bypass missing consent permissions');
const acquaintanceGate=chooseNightV2Round({packKey:'getting_closer',roundIndex:0,level:2,permissions:['words','embrace','kiss','touch','massage','closer'],usedKeys:[]});
assert.equal(acquaintanceGate,null,'Acquaintance-oriented pack belongs in For Us, not Night');

const first=chooseNightV2Round({packKey:'tender',roundIndex:0,level:2,permissions:['words','embrace','kiss','touch','massage','closer'],usedKeys:[]});
const alternate=chooseNightV2Round({packKey:'tender',roundIndex:0,level:2,permissions:['words','embrace','kiss','touch','massage','closer'],usedKeys:[first.key]});
assert.notEqual(first.key,alternate.key,'Changing a task should choose an unused alternative inside the same stage');
assert.equal(first.leader,alternate.leader,'Changing a task must not consume the next initiative stage');
const secondStage=chooseNightV2Round({packKey:'tender',roundIndex:1,level:2,permissions:['words','embrace','kiss','touch','massage','closer'],usedKeys:[first.key,alternate.key]});
assert.notEqual(first.leader,secondStage.leader,'Initiative should alternate between actual stages');

assert.equal(resolveNightV2FinalChoice('another_round','continue_without_phone'),'continue_without_phone');
assert.equal(resolveNightV2FinalChoice('another_round','finish'),'finish');

assert.deepEqual(publicNightV2State({packKey:'tender',roundIndex:2,intensity:1,ceiling:2,status:'active'}),{
  version:2,packKey:'tender',roundIndex:2,phase:'challenge',intensity:1,ceiling:2,status:'active',leader:'a'
});

const summary=nightV2CatalogSummary();
assert.equal(summary.packs.length,13,'Source catalog remains intact for history/learning compatibility');
assert.ok(summary.packs.every(pack=>pack.taskCount===pack.length));
assert.equal(summary.coupons.length,NIGHT_V2_COUPONS.length);

console.log('NIGHT_V2_GAME_OK source_packs=13 source_tasks=98 night_allowlist=true intimate_floor=true permission_intersection=true intensity_gate=true same_stage_change=true alternating_stage_lead=true');
