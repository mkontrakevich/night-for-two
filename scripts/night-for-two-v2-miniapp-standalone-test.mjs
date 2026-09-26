import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NIGHT_V2_DISPLAY,NIGHT_FINGERPRINT_POOLS,connectionFingerprint} from '../src/night-for-two-v2-runtime.js';
import {renderNightV3Html} from '../src/night-for-two-miniapp-v3.js';
import {availableNightV2Packs,chooseNightV2Round,NIGHT_V2_INTIMATE_PERMISSIONS,NIGHT_V2_NIGHT_PACKS} from '../src/night-for-two-v2-game.js';

const runtime=fs.readFileSync(new URL('../src/night-for-two-v2-runtime.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/night-for-two-miniapp-v3.js',import.meta.url),'utf8');
const connector=fs.readFileSync(new URL('../src/integrations/relationship-context-connector.js',import.meta.url),'utf8');
const visualAI=fs.readFileSync(new URL('../src/night-for-two-visual-ai.js',import.meta.url),'utf8');
const storyFlow=fs.readFileSync(new URL('../src/night-story-flow.js',import.meta.url),'utf8');

assert.equal(Object.keys(NIGHT_V2_DISPLAY).length,13);
assert.equal(new Set(Object.values(NIGHT_V2_DISPLAY).map(x=>x.title)).size,13);
assert(runtime.includes('./integrations/relationship-context-connector.js'));
for(const forbidden of ['./lovestory-learning-engine.js','./lovestory-harmony-director.js','./lovestory-event-feedback.js','./night-relationship-bridge.js'])assert(!runtime.includes(forbidden),`standalone runtime imports bot-only module: ${forbidden}`);
assert(connector.includes('RELATIONSHIP_CONTEXT_RAW_MESSAGES_FORBIDDEN'));
assert(connector.includes('raw_messages:false'));
assert(runtime.includes('night_v2_round_feedback'));
assert(runtime.includes('night_personal_ideas'));
assert(runtime.includes('generatePersonalIdea'));
assert(runtime.includes('simulateNightPartner'));
assert(runtime.includes('story_flow jsonb'));
assert(runtime.includes('submitStoryChoice'));
assert(runtime.includes('saveReaderProgress'));

const fpA=connectionFingerprint({nonce:'11'.repeat(32),roomCode:'ABC234',ownerId:'1',partnerId:'2'});
const fpB=connectionFingerprint({nonce:'11'.repeat(32),roomCode:'ABC234',ownerId:'2',partnerId:'1'});
assert.deepEqual(fpA,fpB);
assert.equal(fpA.symbols.length,4);
assert.equal(new Set(fpA.symbols).size,4);
assert(NIGHT_FINGERPRINT_POOLS[fpA.style].length>=20);

const noPhysical=availableNightV2Packs({level:2,permissions:['words','embrace']});
assert.equal(noPhysical.length,0);
const intimate=availableNightV2Packs({level:2,permissions:['words','kiss','touch','massage','closer']});
assert(intimate.length>0);
assert(intimate.every(pack=>NIGHT_V2_NIGHT_PACKS.has(pack.key)));
const round=chooseNightV2Round({packKey:'tender',roundIndex:0,level:2,permissions:['words','kiss','touch','massage','closer'],usedKeys:[]});
assert(round);
assert(round.requires.some(x=>NIGHT_V2_INTIMATE_PERMISSIONS.has(x)));

const html=renderNightV3Html();
for(const endpoint of ['/api/visual','/api/connection-ack','/api/selection','/api/done','/api/rate','/api/overall'])assert(html.includes(endpoint),`missing endpoint ${endpoint}`);
for(const endpoint of ['/api/story-choice','/api/story-finish'])assert(app.includes(endpoint),`missing server endpoint ${endpoint}`);
assert(html.includes("api('story-choice'")&&html.includes("api('story-finish'"),'story reader client actions missing');
assert(html.includes('readerBook')&&html.includes('renderEpisodeReader'));
assert(html.includes('data-reader-prev')&&html.includes('data-reader-next'));
assert(html.includes('Тестировать с ИИ-партнёром'));
assert(storyFlow.includes('НЕ иллюстрируй каждую страницу')&&storyFlow.includes('1–2 визуально значимые страницы'));
assert(visualAI.includes('OPENROUTER_API_KEY'));
assert(visualAI.includes('no visible genitals')&&visualAI.includes('no explicit sexual act'));

console.log('NIGHT_MINIAPP_STANDALONE_OK');
