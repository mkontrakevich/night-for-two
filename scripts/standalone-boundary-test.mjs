import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const self=fileURLToPath(import.meta.url);
const root=path.resolve(path.dirname(self),'..');
const runtime=fs.readFileSync(path.join(root,'src/night-for-two-v2-runtime.js'),'utf8');
const connector=fs.readFileSync(path.join(root,'src/integrations/relationship-context-connector.js'),'utf8');
const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
const gateway=fs.readFileSync(path.join(root,'cloudflare/night-gateway/wrangler.jsonc'),'utf8');
const compose=fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8');
const originDeploy=fs.readFileSync(path.join(root,'.github/workflows/deploy-origin.yml'),'utf8');
const telegramPublish=fs.readFileSync(path.join(root,'tools/publish-pages.ps1'),'utf8');

const skipDirs=new Set(['.git','node_modules','output','cache']);
function filesUnder(dir){
  if(!fs.existsSync(dir))return[];
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()&&skipDirs.has(entry.name))continue;
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...filesUnder(p));
    else if((/\.(?:js|mjs|md|json|yaml|yml|py|ps1|html|example)$/i.test(entry.name)||entry.name==='Dockerfile')&&path.resolve(p)!==path.resolve(self))out.push(p);
  }
  return out;
}

const publicSourceFiles=filesUnder(root);
const forbidden=[
  /PRIMARY_OWNER_ID\s*\|\|\s*['"]\d{6,}['"]/u,
  /PARTNER(?:_TELEGRAM)?_ID\s*\|\|\s*['"]\d{6,}['"]/u,
  /PERSONAL_[A-Z][A-Z0-9_]*_CHAT_ID/u,
  /scope\s*[:=]\s*['"]personal_[a-z0-9_-]+/iu,
  /identity:\/\/(?!person-a\/|person-b\/)[a-z0-9_-]+/iu,
  /personal_original_messages/iu
];

for(const file of publicSourceFiles){
  const body=fs.readFileSync(file,'utf8');
  for(const pattern of forbidden)assert(!pattern.test(body),`personal identifier class leaked into ${path.relative(root,file)}: ${pattern}`);
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
assert(!/PERSONAL_[A-Z][A-Z0-9_]*_CHAT_ID/u.test(env));

const gatewayConfig=JSON.parse(gateway);
assert.equal(gatewayConfig.vars?.NIGHT_ORIGIN_PORT,'5683','Cloudflare gateway must target the isolated production host port');
assert.equal(gatewayConfig.vpc_networks?.[0]?.binding,'NIGHT_VPC','Night gateway must keep the production VPC binding name');
const gatewayWorker=(await import('../cloudflare/night-gateway/src/index.js')).default;
let upstreamUrl;
const forwarded=await gatewayWorker.fetch(new Request('https://night42.kontrakevich.workers.dev/night/health'),{
  NIGHT_VPC:{fetch:async request=>{upstreamUrl=request.url;return Response.json({ok:true});}},
  NIGHT_ORIGIN_HOST:'10.0.0.1',NIGHT_ORIGIN_PORT:'5683'
});
assert.equal(forwarded.status,200);
assert.equal(upstreamUrl,'http://10.0.0.1:5683/night/health');
const homeRedirect=await gatewayWorker.fetch(new Request('https://night42.kontrakevich.workers.dev/'),{});
assert.equal(homeRedirect.status,302);
assert.equal(homeRedirect.headers.get('location'),'https://night42.kontrakevich.workers.dev/night');
const originalFetch=globalThis.fetch;
let readerTarget='';
try{
  globalThis.fetch=async request=>{readerTarget=request.url;return new Response('<h1>Reader</h1>',{headers:{'content-type':'text/html'}})};
  const reader=await gatewayWorker.fetch(new Request('https://night42.kontrakevich.workers.dev/reader/'),{});
  assert.equal(reader.status,200);
  assert.equal(reader.headers.get('x-night-product'),'reader');
  assert.equal(readerTarget,'https://mkontrakevich.github.io/night-for-two/index.html');
}finally{globalThis.fetch=originalFetch}
assert(compose.includes('"${NIGHT_PORT:-5683}:5681"'),'Docker must publish production host port 5683 to container port 5681');
assert(compose.includes('name: ${NIGHT_CONTEXT_NETWORK:-night_for_two_context}'),'Night must use the dedicated external sanitized-context network');
assert(compose.includes('      - night_context'),'Night app must join the dedicated sanitized-context network');
const postgresBlock=compose.split('\n\n  app:')[0];
assert(!postgresBlock.includes('night_context'),'Night Postgres must remain isolated from the bot context network');
assert(originDeploy.includes('Block unsafe direct production deployment')&&originDeploy.includes('marins-reminder-bot')&&!originDeploy.includes('docker compose -p night-for-two up'),'Direct Night production deployment must be blocked and routed to the canonical bridge');
assert(telegramPublish.includes('chat_id = $ChatId')&&!telegramPublish.includes('Publish-DefaultMenu'),'Night menu publication must affect only the two pair chats');

console.log('STANDALONE_BOUNDARY_OK raw_messages=false relationship_analysis_external=true anonymized=true production_origin_port=5683 private_context_network=true');
