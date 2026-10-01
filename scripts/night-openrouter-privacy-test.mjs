import assert from 'node:assert/strict';
import {completeOpenRouter} from '../src/ai/openrouter-client.js';
import fs from 'node:fs';

let captured=null;
const fetcher=async(url,options)=>{
  captured={url,options,body:JSON.parse(options.body)};
  return {ok:true,json:async()=>({model:'test/zdr',choices:[{message:{content:'ok'}}],usage:{prompt_tokens:1,completion_tokens:1}})};
};
const result=await completeOpenRouter({messages:[{role:'user',content:'private relationship context'}],model:'test/zdr',fetcher});
assert.equal(result.text,'ok');
assert.equal(captured.body.provider.zdr,true);
assert.equal(captured.body.provider.data_collection,'deny');
assert.equal(captured.options.headers['content-type'],'application/json');
const connector=fs.readFileSync(new URL('../src/integrations/relationship-context-connector.js',import.meta.url),'utf8');
assert.match(connector,/RELATIONSHIP_CONTEXT_TOKEN_REQUIRED/);
assert.match(connector,/authorization:\`Bearer \\${token}\\`/);
console.log('NIGHT_OPENROUTER_PRIVACY_OK zdr=true data_collection=deny relationship_token=required');
