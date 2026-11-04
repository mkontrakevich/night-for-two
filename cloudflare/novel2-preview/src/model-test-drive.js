// Private Drive adapter for Night for Two. Credentials are supplied through
// Worker secrets; no request, credential, file content, or response is logged.
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(value);
async function smallJson(response,limit=65536){
  if(!response.body)throw Error('DRIVE_INVALID_RESPONSE');
  const reader=response.body.getReader(),parts=[];let n=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>limit)throw Error('DRIVE_INVALID_RESPONSE');parts.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(n);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('DRIVE_INVALID_RESPONSE')}
}
export function modelTestDrive(env,request=fetch){
  const folder=env.MODEL_TESTS_DRIVE_FOLDER_ID;
  if(!validId(folder)||!env.MODEL_TESTS_GOOGLE_CLIENT_ID||!env.MODEL_TESTS_GOOGLE_CLIENT_SECRET||!env.MODEL_TESTS_GOOGLE_REFRESH_TOKEN)throw Error('DRIVE_NOT_CONFIGURED');
  async function token(){
    let response;try{response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:env.MODEL_TESTS_GOOGLE_CLIENT_ID,client_secret:env.MODEL_TESTS_GOOGLE_CLIENT_SECRET,refresh_token:env.MODEL_TESTS_GOOGLE_REFRESH_TOKEN}),signal:AbortSignal.timeout(15000)})}catch{throw Error('DRIVE_AUTH_UNAVAILABLE')}
    if(!response.ok)throw Error('DRIVE_AUTH_FAILED');
    const data=await smallJson(response);if(typeof data.access_token!=='string'||!data.access_token)throw Error('DRIVE_AUTH_FAILED');return data.access_token;
  }
  async function upload(name,type,content,jobId,kind){
    if(typeof name!=='string'||name.length<1||name.length>160||/[\\/\x00-\x1f]/.test(name))throw Error('DRIVE_FILENAME_INVALID');
    if(!/^[a-f0-9-]{36}$/.test(jobId)||!['source','result'].includes(kind))throw Error('DRIVE_UPLOAD_INVALID');
    if(!(content instanceof Uint8Array)||content.byteLength>4_000_000)throw Error('DRIVE_CONTENT_TOO_LARGE');
    const credential=await token(),boundary='novel2-'+crypto.randomUUID();
    const metadata={name,parents:[folder],mimeType:type,appProperties:{novel2_model_test:jobId,novel2_model_test_kind:kind}};
    const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: '+type+'\r\n\r\n',content,'\r\n--'+boundary+'--\r\n']);
    let response;try{response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'multipart/related; boundary='+boundary},body,signal:AbortSignal.timeout(30000)})}catch{throw Error('DRIVE_WRITE_UNCERTAIN')}
    if(!response.ok)throw Error('DRIVE_WRITE_UNCERTAIN');
    let result;try{result=await smallJson(response)}catch{throw Error('DRIVE_WRITE_UNCERTAIN')}
    if(!validId(result.id))throw Error('DRIVE_WRITE_UNCERTAIN');
    return {id:result.id,name:result.name||name,url:typeof result.webViewLink==='string'?result.webViewLink:null};
  }
  return {upload};
}
