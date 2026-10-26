import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';

if(process.env.NOVEL2_AUTH_ALIAS_FIXTURE){
  const {authenticate}=await import('../src/auth.js');
  const sign=id=>{
    const values={auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id)})};
    const check=Object.entries(values).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    const key=crypto.createHmac('sha256','WebAppData').update('isolated-unit-token').digest();
    return new URLSearchParams({...values,hash:crypto.createHmac('sha256',key).update(check).digest('hex')}).toString();
  };
  for(const [id,role] of [['111','A'],['222','B']])assert.equal(authenticate({headers:{'x-telegram-init-data':sign(id)}})?.role,role);
  assert.equal(authenticate({headers:{'x-telegram-init-data':sign('333')}}),null);
  assert.equal(authenticate({headers:{'x-telegram-init-data':'tampered=1&'+sign('111')}}),null);
}else{
  for(const isolated of [true,false]){
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{encoding:'utf8',env:{...process.env,
      NOVEL2_AUTH_ALIAS_FIXTURE:'1',NOVEL2_LOCAL_TEST_MODE:'0',PRIMARY_OWNER_ID:'111',PARTNER_TELEGRAM_ID:'222',
      NOVEL2_TELEGRAM_AUTH_TOKEN:isolated?'isolated-unit-token':'',TELEGRAM_BOT_TOKEN:isolated?'':'isolated-unit-token',BOT_TOKEN:''}});
    assert.equal(result.status,0,result.stderr);
  }
  const compose=fs.readFileSync(new URL('../docker-compose.yml',import.meta.url),'utf8');
  assert.match(compose,/NOVEL2_TELEGRAM_AUTH_TOKEN: \$\{TELEGRAM_BOT_TOKEN:-\}/);
  assert.match(compose,/TELEGRAM_BOT_TOKEN: ""/);assert.match(compose,/BOT_TOKEN: ""/);
  console.log('NOVEL2_AUTH_TOKEN_ISOLATION_OK signed_owner signed_partner unauthorized_rejected legacy_config_compatible polling_tokens_empty');
}
