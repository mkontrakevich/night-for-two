// Night4two TEXT TEST v1 — deterministic schemas and comparison; no external LLM calls.
export const ROLES = Object.freeze(['scene', 'sensual_director', 'couple_space']);
export const FRAME_KEYS = Object.freeze(['frame_title', 'scene_summary', 'shot_type', 'camera_angle', 'wardrobe_props', 'environment', 'lighting', 'palette', 'emotion', 'sensory_details', 'final_image_prompt', 'negative_prompt']);
export const PROMPT_COLUMNS = Object.freeze(['job_id','scene_id','model_id','status','shot_type','camera_angle','lens_mm','blocking','emotion','wardrobe_props','environment','lighting','palette','final_image_prompt','negative_prompt','compliance_score','continuity_score','visual_specificity_score','estimated_cost_usd','actual_cost_usd','elapsed_ms']);
export const AROMA_COLUMNS = Object.freeze(['job_id','scene_id','model_id','aroma_label','tone_density','sensuality_level','intimacy_level','cinematicity','visual_specificity','softness','tension','elegance','aroma_notes','rubric_version','evaluator_model','confidence']);
export const RUBRIC = Object.freeze({version:'n4t-aroma-rules-v1',evaluator:'rules:n4t-aroma-v1',scale:'0..10, null means insufficient evidence',labels:['velvet','smoky','crystal','silk','nocturne','intimate','editorial','dramatic','restrained','luxurious'],method:'observable lexical cues; not a ranking, not a psychological judgment'});
const MATCHES = {
  cinematicity:/(?<![\p{L}\p{N}])(?:камера|кадр|объектив|план|фокус|диафрагм|lens|frame|camera|shot|focus)[\p{L}]*/iu,
  softness:/(?<![\p{L}\p{N}])(?:мягк|нежн|плавн|рассеян|soft|gentle|diffus)[\p{L}]*/iu,
  tension:/(?<![\p{L}\p{N}])(?:напряж|ожидан|контраст|резк|тишин|tension|contrast|suspense)[\p{L}]*/iu,
  elegance:/(?<![\p{L}\p{N}])(?:элегант|изящ|сдержан|утонч|editorial|elegant|refined|restrained)[\p{L}]*/iu,
  sensuality_level:/(?<![\p{L}\p{N}])(?:шёлк|шелк|бархат|прикоснов|фактур|взгляд|silk|velvet|touch|texture|gaze)[\p{L}]*/iu,
  intimacy_level:/(?<![\p{L}\p{N}])(?:близост|дистанц|вместе|рядом|пара|proximity|distance|intimate|together)[\p{L}]*/iu,
  visual_specificity:/(?<![\p{L}\p{N}])(?:слева|справа|переднем|заднем|сверху|снизу|тень|рук|пальц|лев|прав|behind|foreground|background|shadow|hand|left|right)[\p{L}]*/iu
};
const AROMA_HINTS = [
 ['velvet',/бархат|velvet/iu],['smoky',/дым|туман|smok/iu],['crystal',/стекл|кристалл|crystal/iu],['silk',/шелк|шёлк|silk/iu],['nocturne',/ноч|полумрак|night|nocturne/iu],['intimate',/близост|близк|интим|intimate|proximity/iu],['editorial',/редакцион|журнал|editorial|fashion/iu],['dramatic',/драмат|контраст|dramatic|contrast/iu],['restrained',/сдержан|лаконич|restrained|minimal/iu],['luxurious',/роскош|люкс|luxurious|luxury/iu]
];
export async function sha256Hex(bytes) { const digest=await crypto.subtle.digest('SHA-256', bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function parseUpload({role,filename,data,sha256}) {
  if(!ROLES.includes(role))throw Error('ASSET_ROLE_INVALID');
  if(typeof filename!=='string'||filename.length>160||/[\\/\x00-\x1f]/u.test(filename)||!(role==='scene'?/\.txt$/iu:/\.(?:md|txt)$/iu).test(filename))throw Error('ASSET_FILE_INVALID');
  if(typeof data!=='string'||data.length>90000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('ASSET_DATA_INVALID');
  let binary;try{binary=atob(data);}catch{throw Error('ASSET_DATA_INVALID');}
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.length===0||bytes.length>65536)throw Error('ASSET_SIZE_INVALID');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('ASSET_ENCODING_INVALID');}
  if(!text.trim()||text.includes('\0'))throw Error('ASSET_CONTENT_INVALID');
  if(sha256!==undefined&&sha256!==null&&!/^[0-9a-f]{64}$/i.test(sha256))throw Error('ASSET_HASH_INVALID');
  return {filename,bytes,text,claimedHash:sha256?.toLowerCase()||null};
}
export function buildModelPrompt(inputs,sceneId='scene-001') {
  for(const role of ROLES)if(typeof inputs?.[role]?.text!=='string'||!inputs[role].text.trim())throw Error('MISSING_INSTRUCTIONS');
  const preamble=`Night4two fiction_test, scene ${sceneId}. Produce one non-graphic cinematic frame featuring adults only, consistent with the supplied scene. Do not invent past events, identities, actions or visual details not established by the source. Respect model policies. The two project skills are supplied as reference documents for staging and visual continuity; their private two-player match mechanics do not apply to this fictional single-scene test. Output exactly one JSON object with the keys in FRAME_SCHEMA. Unsupported or unknown fields must be null, never guessed. Every model receives the byte-identical prompt and parameters.\nFRAME_SCHEMA: {"frame_title":string|null,"scene_summary":string|null,"shot_type":string|null,"camera_angle":string|null,"lens_mm":number|null,"blocking":{"person_a":string|null,"person_b":string|null,"hands":string|null,"gaze":string|null,"scale":string|null},"wardrobe_props":string|null,"environment":string|null,"lighting":string|null,"palette":string|null,"emotion":string|null,"sensory_details":string|null,"final_image_prompt":string|null,"negative_prompt":string|null}.`;
  return [preamble,'=== SENSUAL DIRECTOR (read-only instruction) ===',inputs.sensual_director.text,'=== COUPLE SPACE VISUAL DIRECTING REFERENCE (fiction_test; no real-pair private data) ===',inputs.couple_space.text,'=== SOURCE SCENE / USER TASK ===',inputs.scene.text].join('\n\n');
}
function s(v){return typeof v==='string'&&v.trim()?v.trim():null;}
export function normalizeFrame(raw,{jobId,sceneId,modelId,attemptId,usage=null,latencyMs=null}={}) {
  let obj=null,error=null;
  if(typeof raw!=='string')error='INVALID_OUTPUT_TYPE';
  else{try{obj=JSON.parse(raw.trim())}catch{error='INVALID_JSON';}}
  if(!obj||typeof obj!=='object'||Array.isArray(obj)){if(!error)error='INVALID_FRAME_OBJECT';obj={};}
  const output={schema_version:'n4t-frame-v1',job_id:jobId??null,scene_id:sceneId??null,model_id:modelId??null,attempt_id:attemptId??null,status:'complete'};
  for(const key of FRAME_KEYS)output[key]=s(obj[key]);
  const b=obj.blocking&&typeof obj.blocking==='object'&&!Array.isArray(obj.blocking)?obj.blocking:{};
  output.blocking={person_a:s(b.person_a),person_b:s(b.person_b),hands:s(b.hands),gaze:s(b.gaze),scale:s(b.scale)};
  output.lens_mm=Number.isFinite(obj.lens_mm)&&obj.lens_mm>=10&&obj.lens_mm<=300?obj.lens_mm:null;
  output.provider={usage:usage&&typeof usage==='object'?usage:null,cost_usd:typeof usage?.cost==='number'&&Number.isFinite(usage.cost)?usage.cost:null,latency_ms:latencyMs};
  const required=['shot_type','camera_angle','final_image_prompt'];
  const missing=required.filter(x=>output[x]===null);
  const validation_error=error|| (missing.length?'MISSING_REQUIRED_FIELDS: '+missing.join(','):null);
  output.validation_error=validation_error;
  if(validation_error)output.status='invalid_schema';
  return output;
}
function estimatedScore(text,re,complete){if(!complete||!text)return null;const matches=String(text).match(new RegExp(re.source,'giu'))||[];return matches.length?Math.min(10,2+matches.length*2):null;}
export function classifyAroma(frame,modelId){
  const complete=frame?.status==='complete';
  const t=complete?[frame.scene_summary,frame.emotion,frame.sensory_details,frame.final_image_prompt,frame.lighting,frame.palette].filter(Boolean).join(' '):'';
  const matched=AROMA_HINTS.filter(([,re])=>re.test(t)).map(([name])=>name);
  const density=(t.match(/\S+/g)||[]).length;
  const result={job_id:frame?.job_id||null,scene_id:frame?.scene_id||null,model_id:modelId,aroma_label:matched[0]||null,tone_density:!complete?null:density<35?'low':density<110?'medium':'high'};
  for(const [key,re] of Object.entries(MATCHES))result[key]=estimatedScore(t,re,complete);
  result.aroma_notes=matched.length?'Lexical signals: '+matched.join(', '):null;
  result.rubric_version=RUBRIC.version;
  result.evaluator_model=RUBRIC.evaluator;
  result.confidence=matched.length?'low':null;
  return result;
}
export function asCsv(rows,columns){
  const escape=x=>{const v=x===null||x===undefined?'':typeof x==='object'?JSON.stringify(x):String(x);return '"'+v.replace(/"/g,'""')+'"'};
  return '\uFEFF'+[columns.join(','),...rows.map(row=>columns.map(col=>escape(row[col])).join(','))].join('\r\n')+'\r\n';
}
export function createComparisons(job){
  const prompt=[],aromas=[];
  for(const result of job.results||[]){
    const f=result.normalized||normalizeFrame(null,{jobId:job.id,sceneId:job.sceneId,modelId:result.model,attemptId:result.attempt});
    const status=result.status==='complete'?f.status:result.status;
    const row={job_id:job.id,scene_id:job.sceneId,model_id:result.model,status,shot_type:f.shot_type,camera_angle:f.camera_angle,lens_mm:f.lens_mm,blocking:f.blocking,emotion:f.emotion,wardrobe_props:f.wardrobe_props,environment:f.environment,lighting:f.lighting,palette:f.palette,final_image_prompt:f.final_image_prompt,negative_prompt:f.negative_prompt,compliance_score:null,continuity_score:null,visual_specificity_score:null,estimated_cost_usd:job.modelCostCeilings?.[result.model]??null,actual_cost_usd:f.provider?.cost_usd??null,elapsed_ms:f.provider?.latency_ms??null};
    prompt.push(row);
    aromas.push(classifyAroma({...f,status},result.model));
  }
  return {schema_version:'n4t-comparison-v1',job_id:job.id,scene_id:job.sceneId,prompt,aromas,rubric:RUBRIC};
}
