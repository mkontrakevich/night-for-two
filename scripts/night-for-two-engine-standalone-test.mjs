import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {TASKS,normalizePermissions,applyFeedbackState,pairPermissionIntersection,chooseTask,taskForRole,computeNextStage,shouldEnterFlow} from '../src/night-for-two-engine.js';
import {validateTelegramInitData} from '../src/night-for-two-miniapp.js';
import {isTestTelegramUserId} from '../src/night-for-two-test-partner.js';

assert(TASKS.length>=20);
assert.deepEqual(normalizePermissions(['words','words','bad']),['words']);
assert.deepEqual(pairPermissionIntersection([{permissions:['words','kiss']},{permissions:['words','touch']}]),['words']);
assert(applyFeedbackState({heat:1,desire_score:50},'up').heat>1);
assert(applyFeedbackState({heat:1,desire_score:50},'down').heat<1);
assert((chooseTask(5,['words'],[],.2).requires||[]).every(x=>x==='words'));
assert(taskForRole('last_step','A')?.text);
const players=[{heat:3,desire_score:80},{heat:3,desire_score:78}];
assert.equal(computeNextStage({currentStage:2,roundNo:3,players,directions:['up','up']}),3);
assert.equal(shouldEnterFlow({roundNo:7,currentStage:4,nextStage:4,directions:['same','up'],allowed:['words','touch','closer']}),true);
assert.equal(isTestTelegramUserId('-900000000001'),true);

const token='test-token-for-signature-only';
const now=1662771648;
const params=new URLSearchParams({query_id:'TEST_QUERY',user:JSON.stringify({id:279058397,first_name:'Test'}),auth_date:String(now)});
const dataCheck=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
params.set('hash',crypto.createHmac('sha256',secret).update(dataCheck).digest('hex'));
assert.equal(validateTelegramInitData(params.toString(),token,{now,maxAgeSeconds:60}).user.id,279058397);
console.log('NIGHT_ENGINE_STANDALONE_OK');
