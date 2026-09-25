import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync(new URL('../src/night-for-two-v2-runtime.js',import.meta.url),'utf8');
const connector=fs.readFileSync(new URL('../src/integrations/relationship-context-connector.js',import.meta.url),'utf8');
const env=fs.readFileSync(new URL('../.env.example',import.meta.url),'utf8');

for(const forbidden of ['278761627','1139656090','personal_snezha','PERSONAL_SNEZHA_CHAT_ID','Михаил','Снежа']){
  assert(!runtime.includes(forbidden),`personal identifier leaked into runtime: ${forbidden}`);
  assert(!connector.includes(forbidden),`personal identifier leaked into connector: ${forbidden}`);
}
assert(runtime.includes('./integrations/relationship-context-connector.js'));
assert(!runtime.includes('./night-relationship-bridge.js'));
assert(connector.includes('RELATIONSHIP_CONTEXT_RAW_MESSAGES_FORBIDDEN'));
assert(connector.includes('raw_messages:false'));
assert(env.includes('PARTNER_TELEGRAM_ID='));
console.log('STANDALONE_BOUNDARY_OK raw_messages=false relationship_analysis_external=true');
