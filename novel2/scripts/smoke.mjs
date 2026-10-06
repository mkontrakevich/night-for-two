import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=[
  'src/app.js','src/auth.js','src/db.js','src/ai.js',
  'src/prose-engine.js','src/identity-engine.js','src/visual-engine.js',
  'public/index.html'
];
for(const file of files)assert(fs.existsSync(new URL('../'+file,import.meta.url)),file+' missing');

const prose=fs.readFileSync(new URL('../src/prose-engine.js',import.meta.url),'utf8');
assert(prose.includes('free_reply'));
assert(prose.includes('пользовательская реплика становится каноном'));
assert(!prose.includes('Fifty Shades'));

const visual=fs.readFileSync(new URL('../src/visual-engine.js',import.meta.url),'utf8');
assert(visual.includes('IDENTITY LOCK A'));
assert(visual.includes('PAIR LOCK'));
assert(visual.includes('inputReferences'));

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(html.includes('Ответить от лица героя'));
assert(html.includes("api('reply'"));
assert(html.includes("api('identity/analyze'"));
assert(html.includes('telegram-web-app.js'));
assert(html.includes('telegramInitData()'));
assert(html.includes('Зафиксировать персонажа'));
assert(!html.includes('Секс-купоны'));

console.log('NOVEL2_SMOKE_OK free_reply=true identity_lock=true single_reader=true');
