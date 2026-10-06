import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=[
  'src/app.js','src/auth.js','src/db.js','src/ai.js','src/config.js',
  'src/prose-engine.js','src/identity-engine.js','src/character-builder.js','src/relationship-context.js',
  'src/ai-character-library.js','src/visual-engine.js','public/index.html'
];
for(const file of files)assert(fs.existsSync(new URL('../'+file,import.meta.url)),file+' missing');

const prose=fs.readFileSync(new URL('../src/prose-engine.js',import.meta.url),'utf8');
assert(prose.includes('free_reply'));
assert(prose.includes('пользовательская реплика становится каноном'));
assert(prose.includes('createStoryBlueprint'));
assert(prose.includes('Сначала придумай самостоятельную архитектуру нового романа'));
assert(prose.includes('cast_slots'));
assert(prose.includes('supporting_characters'));
assert(prose.includes('supportingCast'));
assert(prose.includes('characters_present'));
assert(prose.includes('LONG_SCENE_MIN_CHARS=4200'));
assert(prose.includes('5500–9500 знаков'));
assert(prose.includes('ensureLongScene'));
assert(prose.includes('NOVEL2_SCENE_TOO_SHORT'));
assert(!prose.includes('Fifty Shades'));

const config=fs.readFileSync(new URL('../src/config.js',import.meta.url),'utf8');
assert(config.includes("bytedance-seed/seedream-5-0-flash"));

const ai=fs.readFileSync(new URL('../src/ai.js',import.meta.url),'utf8');
assert(ai.includes("NOVEL2_IMAGE_RESOLUTION||'2K'"));
assert(!ai.includes("payload.resolution='1K'"));
assert(ai.includes('NOVEL2_AI_RETRIES'));
assert(ai.includes('NOVEL2_IMAGE_RETRIES'));
assert(ai.includes('TRANSPORT_FAILED'));

const visual=fs.readFileSync(new URL('../src/visual-engine.js',import.meta.url),'utf8');
assert(visual.includes('normalizeCast'));
assert(visual.includes('MULTI-CHARACTER LOCK'));
assert(visual.includes('inputReferences'));
assert(visual.includes('generateSyntheticReference'));
assert(visual.includes('ILLUSTRATE THE CURRENT STORY SCENE'));
assert(visual.includes('CHARACTERS PHYSICALLY PRESENT'));
assert(visual.includes('The scene may contain more than two characters'));
assert(visual.includes('PROSE GROUNDING'));

const presets=fs.readFileSync(new URL('../src/ai-character-library.js',import.meta.url),'utf8');
assert(presets.includes('PRESET_AI_CHARACTERS'));
assert(presets.includes('ai_ada'));
assert(presets.includes('ai_lev'));
assert((presets.match(/id:'ai_/g)||[]).length>=8);
assert(presets.includes("gender:'female'"));
assert(presets.includes("gender:'male'"));
assert(presets.includes("gender:'nonbinary'"));
assert(presets.includes('ai_rin'));
assert(presets.includes('ai_noa'));

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.includes('Ответить от лица героя'));
assert(html.includes("api('reply'"));
assert(html.includes("api('character/build'"));
assert(html.includes('Создать новую историю'));
assert(html.includes('Сначала создаётся история'));
assert(html.includes('STORY FIRST · CAST SECOND'));
assert(html.includes('Каст романа'));
assert(html.includes("api('story/draft/new'"));
assert(html.includes("api('story/draft/launch'"));
assert(html.includes("api('ai-characters'"));
assert(html.includes("api('book/rename'"));
assert(html.includes("api('book/open'"));
assert(html.includes("api('book/delete'"));
assert(html.includes("api('story/draft/delete'"));
assert(html.includes("api('ai-character/avatar'"));
assert(html.includes('askConfirm'));
assert(html.includes('data-delete-draft'));
assert(html.includes('Игрок A и Игрок B — контроллеры'));
assert(html.includes('refreshCastPreview'));
assert(html.includes('Мои романы'));
assert(html.includes('Черновики историй'));
assert(html.includes('data-cast-slot'));
assert(html.includes('roleGenderHints'));
assert(html.includes('genderLabel'));
assert(html.includes('Рекомендуемый гендер'));
assert(html.includes('небинарный персонаж'));
assert(html.includes('AI-персонаж отвечает автоматически'));
assert(html.includes('telegram-web-app.js'));
assert(html.includes('telegramInitData()'));
assert(!html.includes('Секс-купоны'));

const builder=fs.readFileSync(new URL('../src/character-builder.js',import.meta.url),'utf8');
assert(builder.includes('Character Builder'));
assert(builder.includes('visual_dna'));
assert(builder.includes('fictionalized'));
assert(builder.includes('buildSyntheticCharacter'));
assert(builder.includes('genderHint'));
assert(builder.includes('explicit_gender_hint'));
assert(builder.includes('behavioral_baseline'));

const relationship=fs.readFileSync(new URL('../src/relationship-context.js',import.meta.url),'utf8');
assert(relationship.includes('raw_messages:false'));
assert(relationship.includes('intimate_inference_from_dialogue:false'));
assert(relationship.includes('explicitGenderForRole'));
assert(relationship.includes("explicit_relationship_metadata"));
assert(relationship.includes("user_confirmed"));

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

const dbSource=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
assert(dbSource.includes('novel2_ai_characters'));
assert(dbSource.includes('novel2_story_drafts'));
assert(dbSource.includes('novel2_book_cast'));
assert(dbSource.includes('renameBook'));
assert(dbSource.includes('deleteBook'));
assert(dbSource.includes('deleteStoryDraft'));
assert(dbSource.includes('activateBook'));
assert(dbSource.includes('saveBookCast'));
assert(dbSource.includes('getBookCast'));
assert(dbSource.includes('claimBookCastControl'));
assert(dbSource.includes('updateBookCastReference'));

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
assert(app.includes('seedAiCharacterLibrary'));
assert(app.includes("'/novel2/api/ai-characters'"));
assert(app.includes('role_gender_hints'));
assert(app.includes("gender_hint_policy:'explicit_profile_only'"));
assert(app.includes('explicitGenderForRole'));
assert(app.includes("'/novel2/api/story/draft/new'"));
assert(app.includes("'/novel2/api/story/draft/launch'"));
assert(app.includes("'/novel2/api/book/rename'"));
assert(app.includes("'/novel2/api/book/open'"));
assert(app.includes("'/novel2/api/book/delete'"));
assert(app.includes("'/novel2/api/story/draft/delete'"));
assert(app.includes("'/novel2/api/ai-character/avatar'"));
assert(app.includes('ensureAiCharacterReference'));
assert(app.includes("control_mode:participantReady?'human':'ai'"));
assert(app.includes('avatar:String'));
assert(app.includes('supportingCast'));
assert(app.includes('bookCast'));
assert(app.includes('saveAiCharacterReference'));
assert(app.includes('updateBookCastReference'));
assert(app.includes('generated_automatically:true'));

console.log('NOVEL2_SMOKE_OK story_first=true multi_cast=true ai_library=true editable_books=true scene_images=true');
