// Night4two model-test adapter. The OAuth refresh token remains encrypted in
// the dedicated night4two-drive-oauth Worker; it is never copied into Novel2.
// Every file write is attempted once. Lost/ambiguous replies are NOT replayed.
const INGEST_URL='https://night4two-drive-oauth.kontrakevich.workers.dev/api/drive/ingest';
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(value);
async function smallJson(response,limit=65536){
  if(!response.body)throw Error('DRIVE_INVALID_RESPONSE');
  const reader=response.body.getReader(),parts=[];let n=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>limit)throw Error('DRIVE_INVALID_RESPONSE');parts.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(n);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('DRIVE_INVALID_RESPONSE')}
}
export function modelTestDrive(env,request=fetch){
  if(!env.MODEL_TESTS_DRIVE_INGEST_KEY||String(env.MODEL_TESTS_DRIVE_INGEST_KEY).length<24)throw Error('DRIVE_NOT_CONFIGURED');
  async function upload(name,type,content,jobId,kind){
    if(typeof name!=='string'||name.length<1||name.length>160||/[\\/\x00-\x1f]/.test(name))throw Error('DRIVE_FILENAME_INVALID');
    if(!/^[a-f0-9-]{36}$/.test(jobId)||!['source','result'].includes(kind))throw Error('DRIVE_UPLOAD_INVALID');
    if((kind==='source'&&type!=='text/plain')||(kind==='result'&&type!=='application/json'))throw Error('DRIVE_UPLOAD_INVALID');
    if(!(content instanceof Uint8Array)||content.byteLength>2_000_000)throw Error('DRIVE_CONTENT_TOO_LARGE');
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(content)}catch{throw Error('DRIVE_UPLOAD_INVALID')}
    const filename='model-test-'+jobId+'-'+kind+(kind==='source'?'.txt':'.json');
    const body=JSON.stringify({filename,content:text,job_id:jobId,kind,content_type:type});
    let response;
    try{response=await request(INGEST_URL,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+String(env.MODEL_TESTS_DRIVE_INGEST_KEY)},body,signal:AbortSignal.timeout(30000)})}
    catch{throw Error('DRIVE_WRITE_UNCERTAIN')}
    if(!response.ok)throw Error(response.status===401||response.status===503?'DRIVE_NOT_CONFIGURED':'DRIVE_WRITE_UNCERTAIN');
    let payload;try{payload=await smallJson(response)}catch{throw Error('DRIVE_WRITE_UNCERTAIN')}
    if(payload?.ok!==true||!validId(payload.id))throw Error('DRIVE_WRITE_UNCERTAIN');
    return {id:payload.id,name:filename,url:'https://drive.google.com/file/d/'+payload.id+'/view'};
  }
  return {upload};
}
