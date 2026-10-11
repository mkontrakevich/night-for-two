/* Production-only, one paid Stranger reply maximum.
 * Invoked explicitly by GitHub workflow after deployment. Never log secrets
 * or the AI's private user-facing prose.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
const envPath=process.env.NOVEL2_PRODUCTION_ENV||'D:\\Github\\night-for-two\\novel2\\.env';
const parsed=Object.fromEntries(fs.readFileSync(envPath,'utf8').split(/\r?\n/)
  .filter(x=>/^[A-Z_]+=/.test(x))
  .map(x=>{const n=x.indexOf('=');return[x.slice(0,n),x.slice(n+1).trim().replace(/^["']|["']$/g,'')]}));
const token=parsed.TELEGRAM_BOT_TOKEN,id=parsed.PRIMARY_OWNER_ID;
if(!token||!id)throw new Error('NOVEL2_HOST_E2E_AUTH_CONFIGURATION_MISSING');
const payload={auth_date:String(Math.floor(Date.now()/1000)),
  query_id:'NOVEL2_HOST_E2E',user:JSON.stringify({id:Number(id),first_name:'Readiness'})};
const check=Object.entries(payload).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
const secret=crypto.createHmac('sha256','WebAppData').update(token).digest();
const hash=crypto.createHmac('sha256',secret).update(check).digest('hex');
const initData=new URLSearchParams({...payload,hash}).toString();
const url='http://127.0.0.1:5690/novel2/api/host/turn';
const result=await fetch(url,{method:'POST',signal:AbortSignal.timeout(50000),
  headers:{'content-type':'application/json','x-telegram-init-data':initData},
  body:JSON.stringify({stage:'invitation',mood:'тайна'})});
const data=await result.json().catch(()=>({}));
if(!result.ok||!data?.ok||!data?.turn)throw new Error('NOVEL2_HOST_E2E_HTTP_'+result.status);
const t=data.turn;
if(t.stage!=='invitation'||t.next_action!=='accept_invitation'||String(t.line||'').length<25)
  throw new Error('NOVEL2_HOST_E2E_CONTRACT_FAILED');
console.log('NOVEL2_HOST_E2E_CONTRACT_READY=true');
console.log('NOVEL2_HOST_E2E_PROVIDER='+String(t.provider||'unknown').replace(/[^a-z-]/g,''));
console.log('NOVEL2_HOST_E2E_FALLBACK='+Boolean(t.fallback));
console.log('NOVEL2_HOST_E2E_LINE_CHARACTERS='+String(t.line).length);
if(t.provider!=='openrouter'||t.fallback)throw new Error('NOVEL2_HOST_OPENROUTER_NOT_ACTIVE');
console.log('NOVEL2_HOST_OPENROUTER_READY=true');
