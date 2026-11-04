import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import bridge from '../src/index.js';
const crypto=globalThis.crypto??webcrypto;

class KV{
 constructor(init={}){this.m=new Map(Object.entries(init));}
 async get(k){return this.m.get(k)||null}
 async put(k,v){this.m.set(k,String(v))}
 async delete(k){this.m.delete(k)}
}
const keyHex='a1'.repeat(32),bytes=Uint8Array.from(keyHex.match(/../g),x=>parseInt(x,16));
const k=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt']);
const iv=new Uint8Array(12).fill(7);
const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(JSON.stringify({refresh_token:'refresh_token_test'})));
const enc=JSON.stringify({v:1,iv:Buffer.from(iv).toString('base64'),data:Buffer.from(cipher).toString('base64')});
const folder='folder_123456789',kv=new KV({'google:refresh:v1':enc,'google:app_folder_id':folder});
const env={STORE:kv,GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'client-secret',ALLOWED_EMAIL:'owner@example.test',TOKEN_ENCRYPTION_KEY:keyHex,INGEST_KEY:'a_secure_ingest_key_for_tests',PUBLIC_ORIGIN:'https://unit.test'};
let authCalls=0,uploads=0;
globalThis.fetch=async(url,opts={})=>{
 const u=String(url);
 if(u==='https://oauth2.googleapis.com/token'){authCalls++;return Response.json({access_token:'access_for_tests'})}
 if(u.includes('www.googleapis.com/upload/drive/')){
  uploads++;assert.equal(opts.headers.authorization,'Bearer access_for_tests');
  assert.match(opts.headers['content-type'],/multipart\/related/);
  return Response.json({id:'file_123456789',parents:[folder]});
 }
 throw Error('Unexpected external request '+u);
};
const job='a1b2c3d4-1111-4222-8333-123456789abc';
const endpoint='https://unit.test/api/drive/ingest';
const req=(payload,secret=env.INGEST_KEY)=>new Request(endpoint,{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify(payload)});
const source={filename:'model-test-'+job+'-source.txt',content:'neutral test',job_id:job,kind:'source',content_type:'text/plain'};
let res=await bridge.fetch(req(source,'wrong-secret'),env);assert.equal(res.status,401);assert.equal(uploads,0);
res=await bridge.fetch(req({...source,filename:'../test.txt'}),env);assert.equal(res.status,400);
res=await bridge.fetch(req(source),env);assert.equal(res.status,200);assert.equal((await res.json()).id,'file_123456789');assert.equal(uploads,1);assert.equal(authCalls,1);
res=await bridge.fetch(req(source),env);assert.equal(res.status,200);assert.equal((await res.json()).existing,true);assert.equal(uploads,1);
const output={...source,filename:'model-test-'+job+'-result.json',content:'{"results":[]}',kind:'result',content_type:'application/json'};
res=await bridge.fetch(req(output),env);assert.equal(res.status,200);assert.equal(uploads,2);
res=await bridge.fetch(req({...output,job_id:'other'}),env);assert.equal(res.status,400);
const big={...output,job_id:'f2b2c3d4-1111-4222-8333-123456789abc',filename:'model-test-f2b2c3d4-1111-4222-8333-123456789abc-result.json',content:JSON.stringify({text:'A'.repeat(130000)})};
res=await bridge.fetch(req(big),env);assert.equal(res.status,200);assert.equal(uploads,3);
console.log('NIGHT4TWO_DRIVE_BRIDGE_OK');
