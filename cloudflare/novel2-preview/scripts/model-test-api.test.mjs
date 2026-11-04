import assert from 'node:assert/strict';
import {handleModelTests} from '../src/model-test-api.js';
async function hmac(key,text){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(text)))}
const token='test-bot-token',time=Math.floor(Date.now()/1000),user=JSON.stringify({id:42});
const raw=new URLSearchParams({auth_date:String(time),user});const check=[...raw].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n');
const key=await hmac('WebAppData',token);const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);const hash=await crypto.subtle.sign('HMAC',imported,new TextEncoder().encode(check));raw.set('hash',[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''));
let seen=0;
const env={MODEL_TESTS_CLOUD_ENABLED:'1',NOVEL2_TELEGRAM_BOT_TOKEN:token,NOVEL2_ALLOWED_USER_IDS:'42',MODEL_TEST_JOBS:{getByName(key){assert.match(key,/^[a-f0-9]{64}$/);return {config:async()=>{seen++;return {models:['p/model']}}}}}};
const url=new URL('https://example.test/novel2/api/model-tests/config');
const request=(auth)=>new Request(url,{method:'POST',headers:{'x-telegram-init-data':auth},body:'{}'});
assert.equal((await handleModelTests(request(''),env,url)).status,403);assert.equal(seen,0);
const result=await handleModelTests(request(raw.toString()),env,url);assert.equal(result.status,200);assert.deepEqual((await result.json()).models,['p/model']);assert.equal(seen,1);
assert.equal(await handleModelTests(request(''),{...env,MODEL_TESTS_CLOUD_ENABLED:'0'},url),null);
console.log('MODEL_TEST_API_OK');
