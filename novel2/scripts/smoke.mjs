import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(file)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const names=[
 'src/app.js','src/auth.js','src/db.js','src/ai.js','src/config.js',
 'src/prose-engine.js','src/identity-engine.js','src/character-builder.js',
 'src/relationship-context.js','src/visual-engine.js',
 'src/noir-director.js','src/secret-host-engine.js',
 'src/lobby-world.js','src/lobby-world-store.js',
 'public/index.html','public/noir-experience.js','public/noir-host.js',
 'skills/secret-noir-host/SKILL.md'
];
for(const file of names)assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)),file+' missing');
const p=read('src/prose-engine.js'),app=read('src/app.js'),ai=read('src/ai.js'),
  visual=read('src/visual-engine.js'),html=read('public/index.html'),
  host=read('public/noir-host.js'),story=read('src/noir-director.js'),
  db=read('src/db.js'),worker=read('../cloudflare/novel2-preview/src/index.js');
const checks=[
 ['story-first structure',p,'createStoryBlueprint'],
 ['contextual free reply',p,'free_reply'],
 ['narrative continuity',p,'continueStory'],
 ['finite noir episodes',story,'NOIR_MAX_SCENES'],
 ['voluntary trial decline',story,'noir_trial_decline'],
 ['partner privacy',story,'partner_reveal_phase'],
 ['actor generation references',visual,'ACTOR_SHEET_REFERENCES_REQUIRED'],
 ['silk wardrobe actor casting',visual,'IVORY SILK'],
 ['face likeness',visual,'PRIORITIZE likeness'],
 ['same actor four panels',visual,'Exactly FOUR clean panels'],
 ['model identity normalization',ai,'resizeReferences'],
 ['no paid image retry',ai,'attempts:1'],
 ['OpenRouter model fallback',ai,'secretHostCompletion'],
 ['signed telegram authentication',app,'authenticate(req)'],
 ['persistent saved actor',app,'saveCharacterLook'],
 ['secure actor callback',app,"'/novel2/api/identity/calibrate/complete'"],
 ['authenticated host dialogue',app,"'/novel2/api/host/turn'"],
 ['host world start',app,"'/novel2/api/lobby/world/start'"],
 ['host world status',app,"'/novel2/api/lobby/world/status'"],
 ['free-form reply endpoint',app,"'/novel2/api/reply'"],
 ['canonical photo library',db,'novel2_character_looks'],
 ['actor approval',app,'approveIdentity'],
 ['guest location question',host,'hostPlaceField'],
 ['actor review',html,'approveSavedActor'],
 ['saved photo regenerate',html,'characterResumeCalibration'],
 ['story draft from host brief',html,'novel2HostCreativeBrief'],
 ['viewer',html,'openCharacterViewer'],
 ['worker origin VPC',worker,'NOVEL2_VPC.fetch'],
 ['worker durable workflows',worker,'PurgatoryWorldWorkflow'],
 ['protected AI host route',worker,"'/novel2-ai/host'"],
 ['OpenRouter secret guard',worker,'env.OPENROUTER_API_KEY']
];
for(const [label,source,needle] of checks)assert.ok(source.includes(needle),'Missing '+label+': '+needle);
assert.ok(!html.includes('<script src="/novel2/noir-gateway.js'),'legacy competing gateway disabled');
assert.ok(!worker.includes('Bearer '+process.env.OPENROUTER_API_KEY),'must not inline API key');
console.log('NOVEL2_SMOKE_OK contracts='+checks.length+' files='+names.length);
