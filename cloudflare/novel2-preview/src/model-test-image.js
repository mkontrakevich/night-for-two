// Night4two P1: reference-guided pencil storyboard -> final draft.
// No paid AI call is permitted without a separate job approval and ceiling.
export const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
export const IMAGE_STAGES = Object.freeze({SKETCH:'sketch',IMAGE:'image'});
export const FORMATS = Object.freeze({
  portrait:{sketch:[288,496],image:[768,1344]},
  landscape:{sketch:[496,288],image:[1344,768]},
  square:{sketch:[448,448],image:[1024,1024]}
});
const enc=new TextEncoder();
const allowed = v => typeof v==='string' && v.trim() ? v.trim() : 'unknown';
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?((c>>>1)^0xEDB88320):(c>>>1);return c>>>0});
function crc32(bytes,from,to){let c=0xffffffff;for(let i=from;i<to;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0}

function dimensions(bytes){
  if(bytes.length>=45 && bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let offset=8,seenIHDR=false,seenIDAT=false,seenIEND=false,width=0,height=0;
    while(offset+12<=bytes.length){
      const len=view.getUint32(offset),from=offset+4,end=from+4+len;
      if(len>bytes.length||end+4>bytes.length)throw Error('P1_PNG_CHUNK_INVALID');
      const type=String.fromCharCode(...bytes.subarray(from,from+4));
      const stored=view.getUint32(end),calc=crc32(bytes,from,end);
      if(stored!==calc)throw Error('P1_PNG_CRC_INVALID');
      if(!seenIHDR){if(type!=='IHDR'||len!==13)throw Error('P1_PNG_HEADER_INVALID');seenIHDR=true;width=view.getUint32(from+4);height=view.getUint32(from+8);}
      if(type==='IDAT'&&len>0)seenIDAT=true;
      offset=end+4;
      if(type==='IEND'){if(len!==0||offset!==bytes.length)throw Error('P1_PNG_END_INVALID');seenIEND=true;break;}
    }
    if(!seenIHDR||!seenIDAT||!seenIEND)throw Error('P1_PNG_INCOMPLETE');
    return {mime:'image/png',width,height};
  }
  if(bytes.length>=1000&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
    let p=2;
    while(p+9<bytes.length){
      if(bytes[p]!==255){p++;continue}
      let marker=bytes[p+1];p+=2;
      if(marker===0xd9||marker===0xda)break;
      if(marker===0xff||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(p+2>bytes.length)break;
      const size=(bytes[p]<<8)|bytes[p+1];if(size<2||p+size>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        return {mime:'image/jpeg',height:(bytes[p+3]<<8)|bytes[p+4],width:(bytes[p+5]<<8)|bytes[p+6]};
      }
      p+=size;
    }
  }
  throw Error('P1_IMAGE_MIME_INVALID');
}
export function inspectImage(value,{reference=false}={}){
  if(!(value instanceof Uint8Array)||value.length<64||value.length>12_000_000)throw Error('P1_IMAGE_BYTES_INVALID');
  const info=dimensions(value);
  if(!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<64||info.height<64||info.width>1920||info.height>1920)throw Error('P1_IMAGE_DIMENSIONS_INVALID');
  if(reference&&(info.width>=512||info.height>=512))throw Error('P1_REFERENCE_TOO_LARGE');
  return {...info,bytes:value.byteLength};
}
export async function digest(value){const raw=await crypto.subtle.digest('SHA-256',value);return [...new Uint8Array(raw)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function pencilPrompt(frame){
  if(frame?.status!=='complete'||!frame.final_image_prompt||!frame.shot_type||!frame.camera_angle)throw Error('P1_FRAME_INVALID');
  // SD story illustration skill: no unsupported identities or future events.
  const lines=[
    'Monochrome graphite storyboard, single frozen cinematic frame, hand-drawn pencil study on white paper.',
    'SHOT TYPE: '+allowed(frame.shot_type),
    'STORY/ACTION: '+allowed(frame.scene_summary),
    'BODY LANGUAGE / SUBJECT SCALE: '+JSON.stringify(frame.blocking||{}),
    'EMOTION / ATMOSPHERE: '+allowed(frame.emotion),
    'WARDROBE / PROPS / TEXTURES: '+allowed(frame.wardrobe_props),
    'ENVIRONMENT: '+allowed(frame.environment),
    'LIGHT / TIME: '+allowed(frame.lighting),
    'CAMERA / LENS: '+allowed(frame.camera_angle)+'; '+(frame.lens_mm||50)+'mm',
    'IDENTITY / CONTINUITY: only established fictional adult characters; no new objects, people or story reveals.',
    'Composition fidelity: accurate silhouettes, hand positions, gaze, horizon, perspective and staging. No captions, no lettering, no watermarks, no color.'
  ];
  return lines.join('\n');
}
export function finalPrompt(frame){
  if(frame?.status!=='complete'||typeof frame.final_image_prompt!=='string'||frame.final_image_prompt.length<10)throw Error('P1_FRAME_INVALID');
  return ['Use input_image_0 as an exact *composition and posing reference* for the scene described below.',
    'Preserve character count, subject scale, camera position, silhouettes, hand placement, perspective and background geometry from the sketch.',
    'Render natural materials and cinematic light; do not copy graphite texture or add text.',
    'SCENE PROMPT: '+frame.final_image_prompt,
    'NEGATIVE VISUAL CONSTRAINTS: '+allowed(frame.negative_prompt),
    'Do not introduce unestablished people, identity traits, props or future events.'].join('\n');
}
function aiForm(prompt,format,phase,reference){
  if(!FORMATS[format])throw Error('P1_FORMAT_INVALID');
  const [w,h]=FORMATS[format][phase];const form=new FormData();
  form.set('prompt',prompt);form.set('width',String(w));form.set('height',String(h));
  if(reference){const info=inspectImage(reference,{reference:true});form.append('input_image_0',new Blob([reference],{type:info.mime}),'approved-pencil-reference.'+(info.mime==='image/png'?'png':'jpg'));}
  const request=new Response(form);
  return {multipart:{body:request.body,contentType:request.headers.get('content-type')},target:{width:w,height:h}};
}
function decodeImage(response){
  const encoded=response?.image;
  if(typeof encoded!=='string'||encoded.length<100||encoded.length>16_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw Error('P1_PROVIDER_IMAGE_INVALID');
  let binary;try{binary=atob(encoded)}catch{throw Error('P1_PROVIDER_IMAGE_INVALID')}
  const bytes=Uint8Array.from(binary,x=>x.charCodeAt(0));const info=inspectImage(bytes);
  return {bytes,info};
}
export async function runPencil(ai,frame,format='portrait'){
  if(!ai||typeof ai.run!=='function')throw Error('P1_AI_UNCONFIGURED');
  const prompt=pencilPrompt(frame),input=aiForm(prompt,format,'sketch');
  const response=await ai.run(MODEL,{multipart:input.multipart});
  const image=decodeImage(response);
  return {...image,prompt,model:MODEL,sha256:await digest(image.bytes),format,phase:'sketch'};
}
export async function runImage(ai,frame,sketchBytes,format='portrait'){
  if(!ai||typeof ai.run!=='function')throw Error('P1_AI_UNCONFIGURED');
  // The approved real sketch bytes are submitted to input_image_0; no preview URLs.
  inspectImage(sketchBytes,{reference:true});
  const prompt=finalPrompt(frame),input=aiForm(prompt,format,'image',sketchBytes);
  const response=await ai.run(MODEL,{multipart:input.multipart});
  const image=decodeImage(response);
  return {...image,prompt,model:MODEL,sketch_sha256:await digest(sketchBytes),sha256:await digest(image.bytes),format,phase:'image'};
}
export async function persistOriginal(r2,jobId,phase,image){
  if(!r2||typeof r2.put!=='function'||!validId(jobId)||!['sketch','image'].includes(phase)||!image?.sha256||!image?.info)throw Error('P1_STORAGE_INVALID');
  const key='night4two/tests/'+jobId+'/'+phase+'/'+image.sha256+(image.info.mime==='image/png'?'.png':'.jpg');
  const existing=await r2.head(key);if(existing){if(existing.customMetadata?.sha256===image.sha256)return {key,sha256:image.sha256,alreadySaved:true};throw Error('P1_R2_HASH_CONFLICT')}
  await r2.put(key,image.bytes,{httpMetadata:{contentType:image.info.mime},customMetadata:{sha256:image.sha256,job_id:jobId,phase,model:MODEL}});
  const confirmed=await r2.head(key);if(!confirmed||confirmed.size!==image.bytes.length)throw Error('P1_R2_WRITE_UNCERTAIN');
  return {key,sha256:image.sha256,mime:image.info.mime,width:image.info.width,height:image.info.height,bytes:image.bytes.length,alreadySaved:false};
}
