import assert from 'node:assert/strict';
import {modelComparison} from '../src/model-comparison.js';

const env={OPENROUTER_API_KEY:'test',NOVEL2_COMPARE_MODELS:JSON.stringify(['example/model'])};
const request=(body)=>new Request('https://worker.test/novel2-ai/compare-text',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
let calls=0;
const send=async(_url,options)=>{
  calls++;
  const sent=JSON.parse(options.body);
  assert.equal(sent.model,'example/model');
  assert.equal(sent.provider.allow_fallbacks,false);
  return Response.json({model:'example/model',choices:[{message:{content:'A frame description'},finish_reason:'stop'}],usage:{total_tokens:12}});
};
let response=await modelComparison(request({model:'other/model',prompt:'test'}),env,send);
assert.equal(response.status,403);assert.equal(calls,0);
response=await modelComparison(request({model:'example/model',prompt:'test',temperature:0.5,max_tokens:1800}),{},send);
assert.equal(response.status,503);assert.equal(calls,0);
response=await modelComparison(request({model:'example/model',prompt:'test',temperature:0.5,max_tokens:1800}),env,send);
assert.equal((await response.json()).content,'A frame description');assert.equal(calls,1);
response=await modelComparison(request({model:'example/model',prompt:'test',temperature:0.5,max_tokens:1800}),env,async()=>Response.json({choices:[{message:{refusal:'no'},finish_reason:'content_filter'}]}));
assert.equal((await response.json()).refused,true);
response=await modelComparison(request({model:'example/model',prompt:'test',temperature:0.5,max_tokens:1800}),env,async()=>{throw Error('timeout');});
assert.equal((await response.json()).error,'NOVEL2_COMPARE_OUTCOME_UNCERTAIN');
console.log('MODEL_COMPARISON_OK');
