import assert from 'node:assert/strict';
import {mediaIngest} from '../src/media-drive-ingest.js';
class KV{constructor(){this.k=new Map([['google:app_folder_id','folder_123456789']])}async get(k){return this.k.get(k)||null}async put(k,v){this.k.set(k,v)}}
const env={INGEST_KEY:'example_secret_but_not_real',STORE:new KV(),GOOGLE_CLIENT_ID:'fake-id',GOOGLE_CLIENT_SECRET:'fake-secret'};
const job='a1b2c3d4-1111-4222-8333-123456789abc',bytes=new Uint8Array(150).fill(3);bytes.set([137,80,78,71,13,10,26,10],0);
const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const obj={job_id:job,phase:'sketch',mime:'image/png',sha256:sha,content_base64:Buffer.from(bytes).toString('base64')};
const req=(data,key=env.INGEST_KEY)=>new Request('https://unit.test/api/drive/media/ingest',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+key},body:JSON.stringify(data)});
let calls=0;
const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls++;assert.ok(String(url).includes('upload/drive'));const m=options.body;assert.equal(m instanceof Blob,true);const s=await m.arrayBuffer();assert.ok(s.byteLength>bytes.byteLength);return Response.json({id:'file_123456789',parents:['folder_123456789']})};
try{
 assert.equal((await mediaIngest(req(obj,'wrong'),env,{access:async()=>{throw Error('MUST_NOT_CALL')}})).status,401);
 assert.equal((await mediaIngest(req({...obj,sha256:'a'.repeat(64)}),env,{access:async()=>{throw Error('MUST_NOT_CALL')}})).status,400);
 let r=await mediaIngest(req(obj),env,{access:async()=> 'fake-token'});assert.equal(r.status,200);assert.equal((await r.json()).id,'file_123456789');assert.equal(calls,1);
 r=await mediaIngest(req(obj),env,{access:async()=>{throw Error('MUST_NOT_CALL')}});assert.equal((await r.json()).existing,true);assert.equal(calls,1);
 console.log('NIGHT4TWO_P1_MEDIA_DRIVE_OK');
}finally{globalThis.fetch=original}
