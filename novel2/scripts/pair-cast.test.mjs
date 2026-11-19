import assert from 'node:assert/strict';
import {assertRealPairReady,assertRealPairCast} from '../src/pair-cast.js';
const valid={approved:true,identity_lock:'fixed-identity',profile:{},builder_meta:{synthetic:false}};
const ready=x=>Boolean(x?.approved&&x?.profile&&x?.identity_lock&&!x?.builder_meta?.synthetic);
assert.equal(assertRealPairReady({A:valid,B:valid},ready),true);
for(const ids of [{A:valid},{B:valid},{A:valid,B:{...valid,approved:false}},{A:valid,B:{...valid,builder_meta:{synthetic:true}}}])
  assert.throws(()=>assertRealPairReady(ids,ready),/NOVEL2_PAIR_BOTH_ACTORS_REQUIRED/);
const cast=['A','B'].map(role=>({interactive_role:role,source_type:'player',control_mode:'human',identity_lock:'locked-'+role}));
assert.equal(assertRealPairCast(cast),true);
for(const invalid of [[cast[0]],[cast[0],{...cast[1],control_mode:'ai'}],[cast[0],{...cast[1],identity_lock:''}],[cast[0],{...cast[1],source_type:'story_ai'}]])
  assert.throws(()=>assertRealPairCast(invalid),/NOVEL2_PAIR_CAST_MUST_BE_HUMAN/);
console.log('NIGHT4TWO_PAIR_CAST_OK offline_both_real=true no_ai_partner=true');
