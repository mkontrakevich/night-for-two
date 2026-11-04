// Night4two private binary export: signed worker-to-worker request only.
// Google refresh credentials stay in the dedicated OAuth worker.
const output=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const idOk=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{10,200}$/.test(id);
function equal(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0}
async function bounded(req,max){
 if(Number(req.headers.get('content-length')||0)>max||!req.body)throw Error('INVALID_SIZE');
 let size=0,parts=[];const stream=req.body.getReader();
 try{for(;;){const {done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('INVALID_SIZE');parts.push(value)}}finally{stream.releaseLock()}
 const bytes=new Uint8Array(size);let pos=0;for(const x of parts){bytes.set(x,pos);pos+=x.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('INVALID_JSON')}
}
async function digest(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function decode(base64){if(typeof base64!=='string'||base64.length>16_400_000||base64.length<88||!/^[a-zA-Z0-9+/]+={0,2}$/.test(base64))throw Error('INVALID_MEDIA');let str;try{str=atob(base64)}catch{throw Error('INVALID_MEDIA')};if(str.length>12_000_000)throw Error('MEDIA_TOO_LARGE');return Uint8Array.from(str,c=>c.charCodeAt(0))}
function isValidImage(bytes,mime){if(bytes.length<100) return false;
 if(mime==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;
 return false;
}
export async function mediaIngest(req,env,{access}){
 if(!env.INGEST_KEY||!equal(req.headers.get('authorization'),'Bearer '+env.INGEST_KEY))return output({ok:false,error:'UNAUTHORIZED'},401);
 if(!env.STORE||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return output({ok:false,error:'DRIVE_NOT_CONFIGURED'},503);
 let payload;try{payload=await bounded(req,16_700_000)}catch{return output({ok:false,error:'INVALID_BODY'},413)}
 const {job_id:jobId,phase,mime,sha256,content_base64:encoded}=payload||{};
 if(typeof jobId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)||!['sketch','image'].includes(phase)||!['image/png','image/jpeg'].includes(mime)||!(/^[0-9a-f]{64}$/.test(sha256||'')))return output({ok:false,error:'INVALID_METADATA'},400);
 const bytes=decode(encoded);if(!isValidImage(bytes,mime))return output({ok:false,error:'INVALID_IMAGE'},400);
 const sha=await digest(bytes);if(sha!==sha256)return output({ok:false,error:'HASH_MISMATCH'},400);
 const storedKey='media:'+jobId+':'+phase+':'+sha;
 const old=await env.STORE.get(storedKey);if(idOk(old))return output({ok:true,id:old,existing:true});
 try{
  const token=await access(env),folder=await env.STORE.get('google:app_folder_id');if(!idOk(folder))return output({ok:false,error:'APP_FOLDER_NOT_READY'},409);
  const ext=mime==='image/png'?'.png':'.jpg',filename='model-test-'+jobId+'-'+phase+'-'+sha.slice(0,16)+ext;
  const boundary='n4t-'+crypto.randomUUID(),metadata={name:filename,mimeType:mime,parents:[folder]};
  const data=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',bytes,'\r\n--'+boundary+'--\r\n']);
  const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,parents',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'multipart/related; boundary='+boundary},body:data,signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('DRIVE_UPLOAD_HTTP_'+response.status);
  const result=await response.json();if(!idOk(result.id)||!result.parents?.includes(folder))throw Error('DRIVE_UPLOAD_UNCONFIRMED');
  await env.STORE.put(storedKey,result.id);return output({ok:true,id:result.id,filename,sha256:sha});
 }catch(error){return output({ok:false,error:String(error.message||'DRIVE_WRITE_UNCERTAIN').slice(0,80)},502)}
}
