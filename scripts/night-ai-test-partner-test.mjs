import assert from 'node:assert/strict';
import {sanitizeSyntheticPartnerChoice,simulateNightPartner} from '../src/night-ai-test-partner.js';

const sanitized=sanitizeSyntheticPartnerChoice({
  categories:['fantasy','play','invalid','caress'],
  tempo:'active',
  level:'bold',
  permissions:['words','invalid'],
  boundaries:['novel_intimacy','invalid','roleplay','sensory','kiss']
});
assert.equal(sanitized.version,3,'Synthetic QA choice must use the current V3 schema');
assert.deepEqual(sanitized.categories,['fantasy','play','caress']);
assert.equal(sanitized.tempo,'active');
assert.equal(sanitized.level,'bold');
assert(sanitized.permissions.some(x=>['kiss','touch','massage','closer'].includes(x)),'Synthetic QA choice must remain physically testable');
assert(sanitized.boundaries.length<=3);

let captured=null;
const simulated=await simulateNightPartner({
  relationshipProfile:{observations:[{subject:'couple',category:'communication_style',observation:'Спокойный темп работает лучше.',confidence:.9}]},
  loveStoryPassport:{partner:[{preference_key:'category_choice:caress',score:2.4,confidence:.8}]},
  history:[{practice:'massage',reaction:'liked',semantic_summary:'Массаж и спокойный ритм'}],
  mutualWishes:['massage'],
  generate:async request=>{
    captured=request;
    return JSON.stringify({
      categories:['caress','desire'],
      tempo:'slow',
      level:'open',
      permissions:['words','kiss','touch','massage'],
      boundaries:['novel_intimacy'],
      confidence:.82
    });
  }
});
assert.equal(simulated.source,'ai_simulation');
assert.equal(simulated.confidence,.82);
assert.equal(simulated.selection.version,3,'AI simulation must remain compatible with the V3 Mini App choice schema');
assert.deepEqual(simulated.selection.categories,['caress','desire']);
const prompt=JSON.stringify(captured);
assert(prompt.includes('НЕ реальный человек'),'Prompt must explicitly separate simulation from a real partner');
assert(prompt.includes('НЕ голос Снежи'),'Prompt must forbid impersonating Snezha');
assert(prompt.includes('НЕ её согласие'),'Prompt must forbid treating simulation as consent');
assert(prompt.includes('relationshipProfile'),'Simulation must receive aggregate relationship context');
assert(prompt.includes('mutualWishes'),'Simulation must receive mutual LoveStory context');

const fallback=await simulateNightPartner({generate:async()=>{throw new Error('offline')}});
assert.equal(fallback.source,'fallback');
assert.equal(fallback.selection.version,3,'Fallback simulation must remain on the V3 schema');
assert(fallback.selection.categories.length>0);
assert(fallback.selection.permissions.includes('kiss'));

console.log('NIGHT_AI_TEST_PARTNER_OK ai_simulation=true not_impersonation=true not_consent=true fallback=true');
