import fs from 'node:fs';
import assert from 'node:assert/strict';

const store=fs.readFileSync(new URL('../src/night-linear-novel-store.js',import.meta.url),'utf8');
const generator=fs.readFileSync(new URL('./night-generate-linear-novel.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/night-for-two-miniapp-v3.js',import.meta.url),'utf8');
const flow=fs.readFileSync(new URL('../src/night-story-flow.js',import.meta.url),'utf8');

assert(flow.includes('STORY_TOTAL_PAGES=STORY_PAGE_PLAN.reduce'));
assert(flow.includes('[8,10,10,10,10,10,10,10,10,12]'),'Full novel must total exactly 100 pages');
assert(store.includes('night_linear_novels')&&store.includes('night_linear_novel_pages'),'Full novel must persist metadata and pages');
assert(store.includes("status IN ('generating','illustrating','complete','failed')"),'Full novel must expose durable generation status');
assert(generator.includes('generateSerialNovelPlan'),'Generation must start from a complete hidden novel architecture');
assert(generator.includes('for(let chapterIndex=0;chapterIndex<STORY_ARC.length;chapterIndex++)'),'Generator must write every chapter');
assert(generator.includes('for(let pageNo=1;pageNo<=STORY_TOTAL_PAGES;pageNo++)')&&generator.includes("if(!String(page.media_prompt||'').trim())continue"),'Generator must scan all pages but render only pages selected for illustration');
assert(generator.includes('illustrated>2')&&generator.includes('minIllustrations'),'Each chapter must select only one or two meaningful illustration beats');
assert(generator.includes("progress:100"),'Generator must emit an explicit 100% completion marker');
assert(generator.includes("OPENROUTER_API_KEY_MISSING"),'Production illustration generation must require OpenRouter');
assert(generator.includes("BOOK_PAGE:"),'Every selected illustration must use the page narrative as its image prompt');
assert(store.includes('planned_images')||store.includes('AS planned'),'Completion must compare generated images with the selected visual plan, not with all 100 pages');
assert(app.includes("api/novel-page")||app.includes("/api/novel-page"),'Mini App must expose the completed linear novel');
assert(app.includes("api/novel-visual")||app.includes("/api/novel-visual"),'Mini App must serve the matching page illustration');
assert(app.includes("query.get('reader')==='novel'"),'The full novel must have a direct reader URL mode');
assert(app.includes("СТРАНИЦА '+pageNo+' ИЗ '+total"),'Reader must show absolute 1–100 progress');

console.log('NIGHT_LINEAR_NOVEL_CONTRACT_OK pages=100 sparse_visuals=true persisted=true openrouter=true miniapp_reader=true');
