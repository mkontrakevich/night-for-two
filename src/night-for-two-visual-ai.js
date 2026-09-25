import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_MODEL='bytedance-seed/seedream-4.5';
const DEFAULT_FALLBACK='google/gemini-2.5-flash-image';
const inflight=new Map();

const THEMES=Object.freeze({
  dance:'contemporary dance, body rhythm, flowing translucent fabric, sculptural movement, warm theatrical sidelight',
  boudoir:'theatrical boudoir, velvet curtains, antique mirror, candles, satin, lace, perfume-glass reflections',
  domination:'dark leather room, black leather straps, brushed brass rings, controlled crimson practical light, refined BDSM atmosphere',
  romance:'romantic bed interior, crumpled satin sheets, rose petals, candlelight, soft tactile closeness'
});
const MODES=Object.freeze({
  home:'introductory cinematic hero image, seductive but elegant, inviting negative space for interface text',
  waiting_partner:'private room ready, anticipatory stillness, tactile close crop with restrained tension',
  connection_verified:'two-person intimacy implied through anonymous hands and close body lines, trust and privacy',
  private_choice:'private desire selection, introspective detail, fabric and skin geometry, subtle mystery',
  waiting_choice:'anticipation and waiting, quiet close crop, low light and soft focus practicals',
  selector:'choice and tension, split-light body architecture, elegant dark editorial composition',
  ready:'shared mood discovered, mutual softness, cinematic warm shadow and candlelight',
  task:'active scene prompt, intimate close crop of shoulder, back, waist or hands, dynamic but non-explicit',
  round_feedback:'afterglow detail, relaxed body line, silk and candle bokeh',
  overall_feedback:'afterglow stillness, warm intimate detail, quiet luxurious textures',
  day_share:'memory-like still life with body line implied, rose petals, silk and warm practicals',
  story_scene:'full-screen chapter image for an interactive private couple story, cinematic anonymous adult body language, strong narrative atmosphere and negative space for overlaid story text',
  story_final:'climactic but tasteful closing chapter image, anonymous adult closeness, intense cinematic atmosphere, no explicit sexual act, generous dark negative space for final text',
  complete:'closing afterglow, rumpled satin, candlelight, rose petals and an anonymous relaxed body contour'
});

function safeKey(value=''){return String(value||'visual').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'visual';}
function cacheDir(){return process.env.NIGHT_VISUAL_CACHE_DIR||path.join(process.env.CONFIG_DIR||'/app/config','night-visuals');}
function promptFor({theme='domination',mode='home',variant=''}) {
  const themeText=THEMES[theme]||THEMES.domination,modeText=MODES[mode]||MODES.home,narrative=String(variant||'').trim();
  const storyMode=mode==='story_scene'||mode==='story_final'||narrative.startsWith('BOOK_PAGE:');
  return [
    'Create one photorealistic vertical 9:16 cinematic editorial image for a premium serialized romance inside a private couples mobile reader.',
    storyMode
      ? 'Illustrate the exact narrative beat supplied below. The image must feel like the next shot of the same film, not a generic romance stock image.'
      : 'Create a contextual atmosphere image for the current app screen.',
    'Recurring visual language: two clearly adult partners, elegant contemporary styling, realistic anatomy, tactile fabrics, cinematic depth, natural body language and emotionally readable distance.',
    'Continuity rule: preserve the same broad couple archetype, lighting language, wardrobe palette and location details already implied by the narrative whenever the prompt indicates continuity.',
    'Tasteful sensuality only: no visible genitals, no nipples, no explicit sexual act, no pornographic framing, no fetishized close-up, no text, no logo, no watermark.',
    'Faces may be shown only as non-identifiable fictional adults; never imitate or identify a real person.',
    'Romantic intimacy can be conveyed through gaze, embrace, hands, silhouette, clothing, bedding, reflections, atmosphere and implied off-screen action.',
    `Evening visual theme: ${themeText}.`,
    `Screen context: ${modeText}.`,
    storyMode
      ? `NARRATIVE FRAME TO ILLUSTRATE: ${narrative.replace(/^BOOK_PAGE:\s*/,'')||'continue the established romantic scene'}.`
      : `Variation direction: ${narrative||'fresh composition, do not repeat common prior framing'}.`,
    'Composition: leave readable negative space for overlaid Russian prose; avoid placing important faces or hands beneath the lower text zone.',
    'Camera: premium editorial photography, physically plausible perspective, controlled highlights, rich detailed shadows, cinematic shallow depth of field.',
    'Output: one coherent photographic frame, luxurious, emotionally immersive, tasteful and non-explicit.'
  ].join('\n');
}
async function imageRequest({prompt}) {
  const key=process.env.OPENROUTER_API_KEY||'';
  if(!key)return null;
  const models=[process.env.NIGHT_VISUAL_MODEL||process.env.PERSONAL_IMAGE_MODEL||DEFAULT_MODEL,process.env.NIGHT_VISUAL_FALLBACK_MODEL||process.env.PERSONAL_IMAGE_FALLBACK_MODEL||DEFAULT_FALLBACK].filter((v,i,a)=>v&&a.indexOf(v)===i);
  let last=null;
  for(const model of models){
    try{
      const payload={model,prompt,aspect_ratio:'9:16',output_format:'jpeg'};
      if(model.includes('seedream'))payload.resolution=process.env.NIGHT_VISUAL_RESOLUTION||'1K';
      const response=await fetch('https://openrouter.ai/api/v1/images',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','HTTP-Referer':'https://github.com/mkontrakevich/night-for-two','X-Title':'MARINS Night for Two Visuals'},body:JSON.stringify(payload)});
      const json=await response.json();
      if(!response.ok)throw new Error(`OPENROUTER_IMAGE_${response.status}:${json?.error?.message||'failed'}`);
      const first=json?.data?.[0];if(!first?.b64_json)throw new Error('OPENROUTER_IMAGE_EMPTY');
      return {buffer:Buffer.from(first.b64_json,'base64'),model};
    }catch(error){last=error;}
  }
  throw last||new Error('NIGHT_VISUAL_GENERATION_FAILED');
}
export function createNightVisualAI(){
  async function ensure({key,theme='domination',mode='home',variant=''}) {
    const id=safeKey(key),dir=cacheDir(),file=path.join(dir,`${id}.jpg`);
    try{return {buffer:await fs.readFile(file),cached:true,key:id};}catch{}
    if(!process.env.OPENROUTER_API_KEY)return {buffer:null,cached:false,key:id,disabled:true};
    if(inflight.has(id))return inflight.get(id);
    const work=(async()=>{
      await fs.mkdir(dir,{recursive:true});
      const result=await imageRequest({prompt:promptFor({theme,mode,variant:`${variant} · visual-id ${crypto.createHash('sha256').update(id).digest('hex').slice(0,12)}`})});
      if(!result?.buffer)return {buffer:null,cached:false,key:id,disabled:true};
      const temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,result.buffer);await fs.rename(temp,file);
      return {buffer:result.buffer,cached:false,key:id,model:result.model};
    })().finally(()=>inflight.delete(id));
    inflight.set(id,work);return work;
  }
  return {ensure,promptFor,safeKey};
}
