import assert from 'node:assert/strict';
import sharp from 'sharp';
import {resizeReferences,buildOpenRouterImagePayload} from '../src/ai.js';

// Regression: visual-engine passes {type:'image_url',image_url:{url:...}} objects,
// and the Worker expects raw JPEG data URLs in input_references. A previous
// format mismatch silently reduced all uploaded photos to zero references.
const sample=await sharp({
  create:{width:40,height:32,channels:3,background:{r:125,g:115,b:105}}
}).jpeg({quality:80}).toBuffer();
const dataUrl='data:image/jpeg;base64,'+sample.toString('base64');
const provided=[
  {type:'image_url',image_url:{url:dataUrl}},
  {image_url:{url:dataUrl}},
  {url:dataUrl},
  dataUrl
];
const converted=await resizeReferences(provided,480,4);
assert.equal(converted.length,4,'all four forms must survive reference normalization');
for(const value of converted){
  assert.match(value,/^data:image\/jpeg;base64,/);
  const resized=Buffer.from(value.split(',')[1],'base64');
  const meta=await sharp(resized).metadata();
  assert.ok(meta.width<512&&meta.height<512,'FLUX.2 reference images must be under 512px');
}
const invalid=await resizeReferences([{type:'image_url',image_url:{url:'not-a-photo'}}],480,4);
assert.deepEqual(invalid,[]);
console.log('NOVEL2_REFERENCE_CONTRACT_OK references=4');

const actorPayload=await buildOpenRouterImagePayload({
  model:'bytedance-seed/seedream-5-0-flash',
  prompt:'Neutral actor sheet',
  inputReferences:provided
});
assert.equal(actorPayload.model,'bytedance-seed/seedream-5-0-flash');
assert.equal(actorPayload.resolution,'2K');
assert.equal(actorPayload.input_references.length,4);
assert.ok(actorPayload.input_references.every(x=>x.type==='image_url'&&x.image_url.url.startsWith('data:image/jpeg;base64,')));
await assert.rejects(buildOpenRouterImagePayload({
  model:'bytedance-seed/seedream-5-0-flash',
  prompt:'Neutral actor sheet',
  inputReferences:[{image_url:{url:'invalid'}}]
}),/NOVEL2_IMAGE_REFERENCES_MISSING/);
console.log('NOVEL2_ACTOR_OPENROUTER_PAYLOAD_OK references=4');
