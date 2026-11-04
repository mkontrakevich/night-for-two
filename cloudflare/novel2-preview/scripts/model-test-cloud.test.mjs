import assert from 'node:assert/strict';
import {ModelTestJobs} from '../src/model-test-jobs.js';
class Storage{
 constructor(){this.map=new Map();this.alarm=null}
 async get(k){return structuredClone(this.map.get(k))}
 async put(k,v){this.map.set(k,structuredClone(v))}
 async list(){return new Map([...this.map].map(([k,v])=>[k,structuredClone(v)]))}
 async setAlarm(t){this.alarm=t}
 async transaction(fn){return fn(this)}
}
const env={NOVEL2_COMPARE_MODELS:JSON.stringify(['p/model']),OPENROUTER_API_KEY:'test',MODEL_TESTS_DRIVE_FOLDER_ID:'folder_123456789',MODEL_TESTS_GOOGLE_CLIENT_ID:'client',MODEL_TESTS_GOOGLE_CLIENT_SECRET:'secret',MODEL_TESTS_GOOGLE_REFRESH_TOKEN:'refresh'};
let modelCalls=0,uploads=0;
globalThis.fetch=async (url,options)=>{
 url=String(url);
 if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test'});
 if(url.includes('upload/drive')){uploads++;return Response.json({id:'file_123456789',webViewLink:'https://drive.google.com/file/d/file_123456789/view'})}
 if(url.includes('openrouter.ai')){modelCalls++;return Response.json({model:'p/model',choices:[{message:{content:'A neutral scene'},finish_reason:'stop'}]})}
 throw Error('unexpected request');
};
const storage=new Storage(),jobs=new ModelTestJobs({storage},env);
const created=await jobs.create({filename:'test.txt',data:btoa('example'),models:['p/model']});
assert.equal(created.state,'ready');assert.equal(uploads,1);assert.equal(created.source,undefined);
await assert.rejects(()=>jobs.start(created.id,false),/CONFIRMATION_REQUIRED/);
assert.equal((await jobs.start(created.id,true)).state,'queued');
await assert.rejects(()=>jobs.start(created.id,true),/JOB_ALREADY_STARTED/);
await jobs.alarm();assert.equal((await jobs.status(created.id)).state,'ready_to_export');assert.equal(modelCalls,1);
await jobs.alarm();const complete=await jobs.status(created.id);assert.equal(complete.state,'complete');assert.equal(uploads,2);assert.equal(complete.results[0].content,'A neutral scene');
await jobs.alarm();assert.equal(modelCalls,1);assert.equal(uploads,2);
const other=new ModelTestJobs({storage:new Storage()},env);await assert.rejects(()=>other.status(created.id),/JOB_NOT_FOUND/);
const originalFetch=globalThis.fetch;
let failedCalls=0;
globalThis.fetch=async(url,options)=>{if(String(url).includes('openrouter.ai')){failedCalls++;throw Error('lost response')}return originalFetch(url,options)};
const uncertain=await jobs.create({filename:'second.txt',data:btoa('neutral test'),models:['p/model']});
await jobs.start(uncertain.id,true);await jobs.alarm();assert.equal((await jobs.status(uncertain.id)).state,'uncertain');
await jobs.alarm();assert.equal(failedCalls,1);
const third=await jobs.create({filename:'third.txt',data:btoa('neutral test'),models:['p/model']});
const stale=await storage.get('job:'+third.id);stale.state='running';stale.results=[{model:'p/model',status:'running'}];stale.updatedAt=Date.now()-130000;await storage.put('job:'+third.id,stale);
assert.equal((await jobs.status(third.id)).state,'uncertain');await jobs.alarm();assert.equal(failedCalls,1);
console.log('MODEL_TEST_CLOUD_OK');
