import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=fs.readFileSync(path.join(root,'src/night-for-two-v2-runtime.js'),'utf8');
const connector=fs.readFileSync(path.join(root,'src/integrations/relationship-context-connector.js'),'utf8');
const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');

const skipDirs=new Set(['.git','node_modules','output','cache']);
function filesUnder(dir){
  if(!fs.existsSync(dir))return[];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()&&skipDirs.has(entry.name))continue;
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...filesUnder(p));
    else if(/\.(?:js|mjs|md|json|yaml|yml|py|ps1|html|example)$/i.test(entry.name)||entry.name==='Dockerfile')out.push(p);
  }
  return out;
}

const publicSourceFiles=filesUnder(root);
const forbidden=[
  /personal_snezha/iu,
  /PERSONAL_SNEZHA_CHAT_ID/u,
  /\bsnezha\b/iu,
  /Снеж/iu,
  /Михаил/iu,
  /identity:\/\/mikhail/iu,
  /identity:\/\/snezha/iu,
  /\b278761627\b/u,
  /\b1139656090\b/u,
  /personal_original_messages/iu
];

for(const file of publicSourceFiles){
  const body=fs.readFileSync(file,'utf8');
  for(const pattern of forbidden)assert(!pattern.test(body),`personal identifier leaked into ${path.relative(root,file)}: ${pattern}`);
}

for(const botOnlyImport of [
  './lovestory-learning-engine.js',
  './lovestory-harmony-director.js',
  './lovestory-event-feedback.js',
  './lovestory-relationship-context.js',
  './night-relationship-bridge.js'
])assert(!runtime.includes(botOnlyImport),`bot-only runtime dependency leaked: ${botOnlyImport}`);

assert(runtime.includes('./integrations/relationship-context-connector.js'));
assert(connector.includes('RELATIONSHIP_CONTEXT_RAW_MESSAGES_FORBIDDEN'));
assert(connector.includes('raw_messages:false'));
assert(env.includes('PARTNER_TELEGRAM_ID='));
assert(!env.includes('PERSONAL_SNEZHA_CHAT_ID'));
console.log('STANDALONE_BOUNDARY_OK raw_messages=false relationship_analysis_external=true anonymized=true');
