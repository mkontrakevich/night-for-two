import {mediaIngest} from './media-drive-ingest.js';
// Night4two: dedicated OAuth and Drive write bridge. Secrets must be
// supplied via Cloudflare Secret bindings. No sensitive payloads are logged.
const H={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const txt=(s,status=200)=>new Response(s,{status,headers:{...H,'content-type':'text/plain; charset=utf-8'}});
const out=(s,status=200)=>Response.json(s,{status,headers:H});
const valid=id=>typeof id==='string'&&/^[\w-]{10,200}$/.test(id);
const scope='openid email https://www.googleapis.com/auth/drive.file';
const canUse=e=>Boolean(e.STORE&&e.GOOGLE_CLIENT_ID&&e.GOOGLE_CLIENT_SECRET&&e.ALLOWED_EMAIL&&/^[a-f0-9]{64}$/i.test(e.TOKEN_ENCRYPTION_KEY||''));
const toBytes=h=>Uint8Array.from(h.match(/../g),p=>parseInt(p,16));
const b64=v=>btoa(String.fromCharCode(...v));
const from64=v=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
async function cryptKey(e){return crypto.subtle.importKey('raw',toBytes(e.TOKEN_ENCRYPTION_KEY),'AES-GCM',false,['encrypt','decrypt'])}
async function seal(obj,e){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptKey(e),new TextEncoder().encode(JSON.stringify(obj)));return JSON.stringify({v:1,iv:b64(iv),data:b64(new Uint8Array(ct))})}
async function open(raw,e){const d=JSON.parse(raw);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(d.iv)},await cryptKey(e),from64(d.data))))}
async function access(e){const encrypted=await e.STORE.get('google:refresh:v1');if(!encrypted)throw Error('DRIVE_NOT_CONNECTED');const saved=await open(encrypted,e);const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET,refresh_token:saved.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('DRIVE_REFRESH_FAILED');const v=await r.json();if(!v.access_token)throw Error('DRIVE_REFRESH_EMPTY');return v.access_token}
async function folder(e,token){const prior=await e.STORE.get('google:app_folder_id');if(valid(prior))return prior;const r=await fetch('https://www.googleapis.com/drive/v3/files?fields=id,parents',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({name:'Night4two — AI Model Test Files',mimeType:'application/vnd.google-apps.folder'})});if(!r.ok)throw Error('DRIVE_CREATE_FOLDER_FAILED');const v=await r.json();if(!valid(v.id))throw Error('DRIVE_FOLDER_ID_INVALID');await e.STORE.put('google:app_folder_id',v.id);return v.id}
async function upload(token,parent,name,content,type){const boundary='night4two-'+crypto.randomUUID();const metadata={name,mimeType:type,parents:[parent]};const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: '+type+'; charset=UTF-8\r\n\r\n',content,'\r\n--'+boundary+'--\r\n']);const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,parents',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'multipart/related; boundary='+boundary},body,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('DRIVE_UPLOAD_HTTP_'+r.status);const v=await r.json();if(!valid(v.id)||!v.parents?.includes(parent))throw Error('DRIVE_UPLOAD_NOT_CONFIRMED');return v.id}
function eq(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function bodyJson(req,max=3500000){if(Number(req.headers.get('content-length')||0)>max||!req.body)throw Error('INVALID_INGEST_SIZE');let n=0,chunks=[];const reader=req.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max)throw Error('INVALID_INGEST_SIZE');chunks.push(value)}}finally{reader.releaseLock()}const bytes=new Uint8Array(n);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('INVALID_INGEST_JSON')}}
async function ingest(req,e){
 if(!e.INGEST_KEY||!eq(req.headers.get('authorization'),'Bearer '+e.INGEST_KEY))return out({ok:false,error:'UNAUTHORIZED'},401);
 if(!canUse(e))return out({ok:false,error:'NOT_CONFIGURED'},503);
 let data;try{data=await bodyJson(req)}catch{return out({ok:false,error:'INVALID_BODY'},413)}
 const {filename,content,job_id:id,kind,content_type:mime}=data||{};
 const artifactTypes={
  source:['.txt','text/plain'],scene:['.txt','text/plain'],
  sensual_director:['.md','text/markdown'],couple_space:['.md','text/markdown'],
  manifest:['.json','application/json'],result:['.json','application/json'],
  prompt_comparison_json:['.json','application/json'],prompt_comparison_csv:['.csv','text/csv'],
  aroma_comparison_json:['.json','application/json'],aroma_comparison_csv:['.csv','text/csv']
 };
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(id||''))||!Object.hasOwn(artifactTypes,String(kind)))return out({ok:false,error:'INVALID_JOB'},400);
 const [ext,allowedMime]=artifactTypes[kind];
 const name='model-test-'+id+'-'+kind+ext;
 if(filename!==name||mime!==allowedMime)return out({ok:false,error:'INVALID_FILE'},400);
 if(typeof content!=='string'||new TextEncoder().encode(content).byteLength>2000000)return out({ok:false,error:'FILE_TOO_LARGE'},413);
 if(mime==='application/json'){try{JSON.parse(content)}catch{return out({ok:false,error:'INVALID_RESULT_JSON'},400)}}
 const record='ingest:'+id+':'+kind,stored=await e.STORE.get(record);
 if(valid(stored))return out({ok:true,id:stored,existing:true});
 try{const token=await access(e),dir=await e.STORE.get('google:app_folder_id');if(!valid(dir))return out({ok:false,error:'APP_FOLDER_NOT_READY'},409);const uploaded=await upload(token,dir,name,content,mime);await e.STORE.put(record,uploaded);return out({ok:true,id:uploaded})}
 catch(error){return out({ok:false,error:String(error?.message||'DRIVE_WRITE_UNCERTAIN').slice(0,80)},502)}
}
export default {async fetch(req,e){
 const u=new URL(req.url),callback=e.PUBLIC_ORIGIN+'/oauth/google/callback';
 if(u.pathname==='/health')return out({service:'night4two-drive-oauth',configured:canUse(e),connected:Boolean(await e.STORE.get('google:refresh:v1')),appFolder:await e.STORE.get('google:app_folder_id')||null});
 if(u.pathname==='/api/drive/media/ingest')return req.method==='POST'?mediaIngest(req,e,{access}):txt('Method not allowed',405);
 if(u.pathname==='/api/drive/ingest')return req.method==='POST'?ingest(req,e):txt('Method not allowed',405);
 if(u.pathname==='/oauth/google/start'){
  if(req.method!=='GET')return txt('Method not allowed',405);
  if(!canUse(e))return txt('OAuth secrets not configured',503);
  const state=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
  await e.STORE.put('state:'+state,'1',{expirationTtl:600});
  const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [k,v] of Object.entries({client_id:e.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope,access_type:'offline',prompt:'consent',state}))auth.searchParams.set(k,v);
  const headers=new Headers(H);headers.set('location',auth.toString());headers.set('set-cookie','n4t_state='+state+'; Max-Age=600; Path=/oauth/google; HttpOnly; Secure; SameSite=Lax');
  return new Response(null,{status:302,headers});
 }
 if(u.pathname==='/oauth/google/callback'){
  if(req.method!=='GET')return txt('Method not allowed',405);
  if(u.searchParams.has('error'))return txt('Google authorization rejected',400);
  if(!canUse(e))return txt('OAuth not configured',503);
  const state=u.searchParams.get('state')||'',code=u.searchParams.get('code')||'';
  const cookie=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('n4t_state='));
  if(!/^[0-9a-f]{64}$/.test(state)||!cookie||cookie.slice(10)!==state||code.length<8||code.length>4096)return txt('Invalid OAuth state',400);
  if(await e.STORE.get('state:'+state)!=='1')return txt('OAuth state expired',400);
  await e.STORE.delete('state:'+state);
  const exchange=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET,redirect_uri:callback,grant_type:'authorization_code'})});
  if(!exchange.ok)return txt('Google code exchange failed',502);
  const t=await exchange.json();if(!t.access_token||!t.refresh_token)return txt('Google offline access not granted',400);
  const check=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+t.access_token}});
  if(!check.ok)return txt('Google identity check failed',502);
  const who=await check.json();
  if(who.email_verified!==true||String(who.email).toLowerCase()!==String(e.ALLOWED_EMAIL).toLowerCase())return txt('Account not authorized',403);
  await e.STORE.put('google:refresh:v1',await seal({refresh_token:t.refresh_token,email:who.email,createdAt:new Date().toISOString()},e));
  try{const parent=await folder(e,t.access_token),fid=await upload(t.access_token,parent,'Night4two_Drive_Test.txt','Night4two Google Drive connection test. No credentials are stored in this file.','text/plain');await e.STORE.put('google:last_test',JSON.stringify({ok:true,fileId:fid,folderId:parent}));return txt('Night4two: Google Drive is connected. Test file created successfully. Application folder ID: '+parent)}
  catch(error){await e.STORE.put('google:last_test',JSON.stringify({ok:false,reason:String(error?.message||error).slice(0,80)}));return txt('Drive OAuth connected; test write failed.',502)}
 }
 return txt('Not found',404);
}};
