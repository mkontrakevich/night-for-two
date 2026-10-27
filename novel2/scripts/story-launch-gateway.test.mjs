import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,AbortController,crypto:globalThis.crypto,console,
  setTimeout:fn=>{fn();return 0;},clearTimeout(){}});
const source=fs.readFileSync(new URL('../../cloudflare/novel2-preview/src/index.js',import.meta.url),'utf8');
const module=new vm.SourceTextModule(source,{context});
const values={WorkflowEntrypoint:class{},handleStranger:async()=>null,runStrangerWorld:async()=>{},
  handleNativeActor:async()=>null,runNativeActor:async()=>{},handleMigrationAdmin:async()=>{},runLegacyMigration:async()=>{},
  ACTOR_VIEW_SPEC:[],actorViewPrompt:()=>'',bytesFromAiImage:()=>{},base64FromBytes:()=>'',compositeActorSvg:()=>''};
await module.link(async specifier=>{
  const names=[...source.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g)].find(match=>match[2]===specifier)[1].split(',').map(x=>x.trim());
  return new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,values[name]);},{context});
});
await module.evaluate();const worker=module.namespace.default;
const request=path=>new Request('https://example.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
for(const path of ['/novel2/api/story/draft/launch','/novel2/api/story/draft/new','/novel2/api/reply']){
  let attempts=0;
  const response=await worker.fetch(request(path),{NOVEL2_ORIGIN_HOST:'private.test',NOVEL2_VPC:{fetch:async()=>{attempts++;throw new TypeError('transport lost');}}});
  assert.equal(response.status,502);assert.equal(attempts,1,'Never replay potentially committed mutation '+path);
}
for(const path of ['/novel2/api/state','/novel2/api/story/draft/launch/status']){
  let attempts=0;
  const response=await worker.fetch(request(path),{NOVEL2_ORIGIN_HOST:'private.test',NOVEL2_VPC:{fetch:async()=>{
    if(++attempts<3)throw new TypeError('transport lost');return Response.json({ok:true,job:null});
  }}});
  assert.equal(response.status,200);assert.equal(attempts,3);assert.equal((await response.json()).ok,true);
  assert.equal(response.headers.get('x-novel2-document-delivery'),'buffered');
}
let assetPath='';
const asset=await worker.fetch(new Request('https://example.test/novel2/story-launch-client.js'),{ASSETS:{fetch:async req=>{assetPath=new URL(req.url).pathname;return new Response('fixture');}}});
assert.equal(asset.status,200);assert.equal(assetPath,'/story-launch-client.js');
const schema={type:'object',required:['first_scene'],properties:{first_scene:{type:'object'}}};
let aiInput;
const structured=await worker.fetch(new Request('https://example.test/novel2-ai/text',{method:'POST',headers:{'content-type':'application/json','x-novel2-service-key':'fixture-key'},body:JSON.stringify({messages:[{role:'user',content:'Neutral fixture'}],json_mode:true,json_schema:schema})}),{NOVEL2_SERVICE_SECRET:'fixture-key',AI:{run:async(_model,input)=>{aiInput=input;return {response:{first_scene:{prose:'Neutral fixture'}}};}}});
assert.equal(structured.status,200);assert.equal(aiInput.response_format.type,'json_schema');assert.equal(aiInput.response_format.json_schema.required[0],'first_scene');
assert.equal(JSON.parse((await structured.json()).content).first_scene.prose,'Neutral fixture','Structured AI objects must not become [object Object]');
let providerCalls=0,providerBody;
context.fetch=async(_url,options)=>{providerCalls++;providerBody=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({first_scene:{prose:'Neutral provider fixture'}})}}]});};
const providerEnv={NOVEL2_SERVICE_SECRET:'fixture-key',OPENROUTER_API_KEY:'fixture-provider-key',AI:{run:()=>{throw new Error('Unexpected provider fallback');}}};
const providerRequest=()=>new Request('https://example.test/novel2-ai/text',{method:'POST',headers:{'content-type':'application/json','x-novel2-service-key':'fixture-key'},body:JSON.stringify({messages:[{role:'user',content:'Neutral fixture JSON'}],json_mode:true,json_schema:schema})});
const providerResult=await worker.fetch(providerRequest(),providerEnv);
assert.equal(providerResult.status,200);assert.equal((await providerResult.json()).provider,'openrouter');assert.equal(providerBody.response_format.json_schema.schema.required[0],'first_scene');assert.equal(providerBody.provider.require_parameters,true);assert.equal(providerCalls,1);
context.fetch=async()=>{providerCalls++;return Response.json({error:'fixture'},{status:402});};
assert.equal((await worker.fetch(providerRequest(),providerEnv)).status,402);assert.equal(providerCalls,2,'A provider failure must not invoke a second inference');
context.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'incomplete fixture'}}]});
assert.equal((await worker.fetch(providerRequest(),providerEnv)).status,422,'Truncated JSON must never be presented as a complete result');
context.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{refusal:'Fixture refusal'}}]});
assert.equal((await worker.fetch(providerRequest(),providerEnv)).status,422,'Provider refusals must remain explicit failures');
console.log('NOVEL2_LAUNCH_GATEWAY_OK mutations_once status_read_retry buffered_status static_client');

