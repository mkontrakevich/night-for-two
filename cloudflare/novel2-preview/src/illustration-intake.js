// Night4two v3 / illustrated scene intake at the authenticated edge.
// The private Python workbench still accepts the unchanged legacy contract.
// The browser submits only a scene; the server owns all visual instructions.
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
export const SCENE_MAX_BYTES=64*1024;
const ALLOWED_NAME=/^[\p{L}\p{N}_. ()-]{1,110}\.(?:txt|md)$/u;
export const SERVER_VISUAL_PROFILE=Object.freeze({
 version:1,
 content_type:'cinematic_romance',
 format:'portrait',
 visual_direction:'Fictional adults only. Single truthful cinematic composition from established source prose. Respect character count, silhouettes, gaze, hand placement, perspective and physical continuity. Natural materials, elegant restrained noir mood, no spoilers, no additions to canon, no visible captions.',
 palette:'Controlled cinematic palette determined by described location and time of day; no artificial neon or beauty smoothing.',
 camera:'Architectural perspective lock, deliberate editorial framing, physically plausible 50 mm lens',
 characters:{},locations:{},scenes:{}
});
function fail(code,status=422){const e=new Error(code);e.status=status;throw e}
function decodeBase64(value){
 if(typeof value!=='string'||value.length<1||value.length>93000||value.length%4===1||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fail('SCENE_BASE64_INVALID');
 try{
   const str=atob(value);
   if(!str.length||str.length>SCENE_MAX_BYTES)fail('SCENE_SIZE_INVALID',413);
   return Uint8Array.from(str,ch=>ch.charCodeAt(0));
 }catch(e){if(e?.status)throw e;fail('SCENE_BASE64_INVALID')}
}
function encodeBase64(bytes){
 let text='';
 for(let offset=0;offset<bytes.length;offset+=8192)text+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
 return btoa(text);
}
export function normalizeIllustrationPrepare(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('SCENE_PAYLOAD_INVALID',400);
 // Reject stale clients and injected backend configuration rather than silently using it.
 if(Object.hasOwn(payload,'instructions')||Object.hasOwn(payload,'config')||Object.hasOwn(payload,'system_prompt'))fail('SYSTEM_INSTRUCTIONS_SERVER_ONLY');
 if(Object.keys(payload).some(k=>!['filename','data'].includes(k)))fail('SCENE_PAYLOAD_INVALID',400);
 const filename=String(payload.filename||'');
 if(!ALLOWED_NAME.test(filename)||filename.includes('..'))fail('SCENE_FILENAME_INVALID');
 const original=decodeBase64(payload.data);
 let text;
 try{text=decoder.decode(original).replace(/^\uFEFF/,'').trim()}catch{fail('SCENE_ENCODING_INVALID')}
 if(text.length<20||!/[\p{L}\p{N}]/u.test(text))fail('SCENE_TOO_SHORT');
 // The existing workbench needs one marker; preserve explicit multi-scene markers.
 // A malformed [[IMAGE:... token is left to the existing strict parser.
 const implicit=!text.includes('[[IMAGE:');
 if(implicit)text+='\n\n[[IMAGE:scene_001]]\n';
 const data=encoder.encode(text);
 if(data.length>SCENE_MAX_BYTES)fail('SCENE_SIZE_INVALID',413);
 return {filename,data:encodeBase64(data),instructions:structuredClone(SERVER_VISUAL_PROFILE)};
}
