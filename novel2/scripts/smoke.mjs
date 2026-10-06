import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=[
  'src/app.js','src/auth.js','src/db.js','src/ai.js',
  'src/prose-engine.js','src/identity-engine.js','src/character-builder.js','src/relationship-context.js','src/visual-engine.js',
  'public/index.html'
];
for(const file of files)assert(fs.existsSync(new URL('../'+file,import.meta.url)),file+' missing');

const prose=fs.readFileSync(new URL('../src/prose-engine.js',import.meta.url),'utf8');
assert(prose.includes('free_reply'));
assert(prose.includes('пользовательская реплика становится каноном'));
assert(prose.includes('NOVEL2_CHARACTER_CARDS_REQUIRED'));
assert(prose.includes('player_characters'));
assert(prose.includes('generateAiCharacterReply'));
assert(prose.includes('visual_scene'));
assert(prose.includes('characters_present'));
assert(prose.includes('LONG_SCENE_MIN_CHARS=4200'));
assert(prose.includes('5500–9500 знаков'));
assert(prose.includes('ensureLongScene'));
assert(prose.includes('3–5 драматургических битов'));
assert(prose.includes('NOVEL2_SCENE_TOO_SHORT'));
assert(prose.includes('локацию сцены'));
assert(!prose.includes('Fifty Shades'));

const ai=fs.readFileSync(new URL('../src/ai.js',import.meta.url),'utf8');
assert(ai.includes("NOVEL2_IMAGE_RESOLUTION||'2K'"));
assert(!ai.includes("payload.resolution='1K'"));
assert(ai.includes('retryPayload'));
assert(ai.includes('NOVEL2_AI_RETRIES'));
assert(ai.includes('NOVEL2_IMAGE_RETRIES'));
assert(ai.includes('TRANSPORT_FAILED'));
assert(ai.includes('transientMessage'));

const visual=fs.readFileSync(new URL('../src/visual-engine.js',import.meta.url),'utf8');
assert(visual.includes('IDENTITY LOCK A'));
assert(visual.includes('PAIR LOCK'));
assert(visual.includes('inputReferences'));
assert(visual.includes('generateSyntheticReference'));
assert(visual.includes('ILLUSTRATE THE CURRENT STORY SCENE'));
assert(visual.includes('LOCATION:'));
assert(visual.includes('CHARACTERS PHYSICALLY PRESENT'));
assert(visual.includes('PROSE GROUNDING'));
assert(visual.includes('meta?.continuity'));

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.includes('Ответить от лица героя'));
assert(html.includes("api('reply'"));
assert(html.includes("api('character/build'"));
assert(html.includes('Создайте персонажа из ваших фото'));
assert(html.includes('Достаточно одной'));
assert(html.includes('characterDraft'));
assert(html.includes('continueCalibration'));
assert(html.includes('Карточка уже сохранена'));
assert(html.includes("api('character/random'"));
assert(html.includes('AI-персонажа'));
assert(html.includes('реальный стиль общения пары'));
assert(html.includes('telegram-web-app.js'));
assert(html.includes('telegramInitData()'));
assert(html.includes('Зафиксировать персонажа'));
assert(html.includes('Выйти из рассказа'));
assert(html.includes("api('book/exit'"));
assert(html.includes('AI-персонаж отвечает автоматически'));
assert(!html.includes('Секс-купоны'));

const builder=fs.readFileSync(new URL('../src/character-builder.js',import.meta.url),'utf8');
assert(builder.includes('Character Builder'));
assert(builder.includes('visual_dna'));
assert(builder.includes('fictionalized'));
assert(builder.includes('buildSyntheticCharacter'));
assert(builder.includes('synthetic_standin'));
assert(builder.includes('sanitized_pair_communication'));
assert(builder.includes('behavioral_baseline'));
const relationship=fs.readFileSync(new URL('../src/relationship-context.js',import.meta.url),'utf8');
assert(relationship.includes('raw_messages:false'));
assert(relationship.includes('intimate_inference_from_dialogue:false'));
assert(relationship.includes('roleSubject'));
const {normalizeIdentityProfile}=await import('../src/identity-engine.js');
const normalizedWrapped=normalizeIdentityProfile({
  visual_identity_profile:{
    face:{shape:'oval',nose:'straight'},
    hair:{color:'dark'},
    stable_core_traits:['oval face']
  }
});
assert.equal(normalizedWrapped.face.overall_shape,'oval');
assert.equal(normalizedWrapped.face.nose_geometry,'straight');
assert.equal(normalizedWrapped.hair.color,'dark');
assert(normalizedWrapped.unknown_traits.includes('body proportions'));

const normalizedPartial=normalizeIdentityProfile({
  face:{eyes:'almond-shaped'},
  appearance_notes:['front portrait only']
});
assert.equal(normalizedPartial.face.eyes_visual,'almond-shaped');
assert(normalizedPartial.body);
assert(normalizedPartial.reference_coverage);
assert(!fs.readFileSync(new URL('../src/identity-engine.js',import.meta.url),'utf8').includes("if(!profile?.face||!profile?.hair||!profile?.body)"));

const dbSource=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
assert(dbSource.includes('archiveBook(bookId'));
assert(dbSource.includes("status='archived'"));

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
assert(app.includes('driveAiTurns'));
assert(app.includes("'/novel2/api/character/random'"));
assert(app.includes("control_mode:'ai'"));
assert(app.includes('calibration_required:true'));
assert(app.includes("'/novel2/api/book/exit'"));
assert(app.includes('archiveBook'));
assert(app.includes('generated_automatically:true'));
assert(app.includes('next.scene.target_role=humanRole'));
console.log('NOVEL2_SMOKE_OK free_reply=true character_cards=true ai_standin=true identity_lock=true single_reader=true');
