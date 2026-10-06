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
assert(!prose.includes('Fifty Shades'));

const ai=fs.readFileSync(new URL('../src/ai.js',import.meta.url),'utf8');
assert(ai.includes("NOVEL2_IMAGE_RESOLUTION||'2K'"));
assert(!ai.includes("payload.resolution='1K'"));
assert(ai.includes('retryPayload'));

const visual=fs.readFileSync(new URL('../src/visual-engine.js',import.meta.url),'utf8');
assert(visual.includes('IDENTITY LOCK A'));
assert(visual.includes('PAIR LOCK'));
assert(visual.includes('inputReferences'));
assert(visual.includes('generateSyntheticReference'));

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.includes('Ответить от лица героя'));
assert(html.includes("api('reply'"));
assert(html.includes("api('character/build'"));
assert(html.includes('Создайте персонажа из ваших фото'));
assert(html.includes('Достаточно одной'));
assert(html.includes('characterDraft'));
assert(html.includes("api('character/random'"));
assert(html.includes('AI-персонажа'));
assert(html.includes('реальный стиль общения пары'));
assert(html.includes('telegram-web-app.js'));
assert(html.includes('telegramInitData()'));
assert(html.includes('Зафиксировать персонажа'));
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
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
assert(app.includes('driveAiTurns'));
assert(app.includes("'/novel2/api/character/random'"));
assert(app.includes("control_mode:'ai'"));
console.log('NOVEL2_SMOKE_OK free_reply=true character_cards=true ai_standin=true identity_lock=true single_reader=true');
