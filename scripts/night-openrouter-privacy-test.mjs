import assert from 'node:assert/strict';
import {completeOpenRouter} from '../src/ai/openrouter-client.js';

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
console.log('NIGHT_OPENROUTER_PRIVACY_OK zdr=true data_collection=deny');
