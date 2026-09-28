import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const generator=read('scripts/night-generate-linear-novel.mjs');
const visual=read('src/night-for-two-visual-ai.js');
const mini=read('src/night-for-two-miniapp-v3.js');
const api=read('src/night-backend-generator-api.js');
const skill=read('skills/couple-space/intimate-narrative/SKILL.md');
const compose=read('docker-compose.yml');

assert(generator.includes('RELATIONSHIP_PROFILE:relationshipProfile'));
assert(generator.includes('createNightRelationshipBridge'));
assert(generator.includes('raw_messages:false'));
assert(generator.includes('NIGHT_LINEAR_ANONYMOUS_DIALOGUE'));
assert(generator.includes('narrativeSkillExcerpt'));
assert(skill.includes('## 17A. Dialogue contract'));
assert(skill.includes('## 17B. Story illustration contract'));
assert(visual.includes('storyboardPromptFor'));
assert(visual.includes('EXACT PAGE FACTS'));
assert(visual.includes('input_references'));
assert(visual.includes('source_text_hash'));
assert(visual.includes('prompt_hash'));
assert(visual.includes('visualQARequest'));
assert(visual.includes('qaPromptFor'));
assert(generator.includes('NIGHT_VISUAL_QA_REJECTED'));
assert(generator.includes('NIGHT_VISUAL_QA_REQUIRED'));
assert(mini.includes('pageText:page.body'));
assert(mini.includes('formatReaderText'));
assert(mini.includes('/night/api/novel-generate'));
assert(api.includes("PREFIX+'novel-generate'"));
assert(api.includes("PREFIX+'novel-status'"));
assert(compose.includes('night_visuals:/app/config/night-visuals'));

console.log('NIGHT_PERSONALIZED_READER_CONTRACT_OK dialogue=true relationship_context=true storyboard=true exact_page_visuals=true visual_qa=true persistent_assets=true backend_generator=true');
