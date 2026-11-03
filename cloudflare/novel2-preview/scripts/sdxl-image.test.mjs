import assert from 'node:assert/strict';
import {generateSdxl,SDXL_MODEL} from '../src/sdxl-image.js';

const png=new Uint8Array([137,80,78,71,13,10,26,10,...new Array(64).fill(1)]);
let calls=0;
const ai={run:async (model,params)=>{calls++;assert.equal(model,SDXL_MODEL);assert.equal(params.num_steps,4);return new ReadableStream({start(c){c.enqueue(png);c.close()}})}};
const data=await generateSdxl(ai,{prompt:'A quiet sea',width:512,height:512,seed:7});
assert.equal(data.model,SDXL_MODEL);assert.equal(data.seed,7);assert.ok(data.image.startsWith('data:image/png;base64,'));assert.equal(calls,1);
await assert.rejects(()=>generateSdxl(ai,{prompt:'test',width:333,height:512}),/SDXL_SIZE_INVALID/);
await assert.rejects(()=>generateSdxl(ai,{prompt:'test',width:512,height:512,input_references:['image']}),/SDXL_REFERENCE_NOT_SUPPORTED/);
assert.equal(calls,1);
await assert.rejects(()=>generateSdxl({run:async()=>new Uint8Array(50)},{prompt:'test',width:512,height:512}),/SDXL_IMAGE_INVALID/);
await assert.rejects(()=>generateSdxl({run:async()=>{throw Error('provider private response')}},{prompt:'test',width:512,height:512}),/SDXL_INFERENCE_FAILED/);
console.log('SDXL adapter checks passed');
