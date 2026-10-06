import {imageCompletion} from './ai.js';

function refsOf(identity) {
  const refs=Array.isArray(identity?.reference_images)?identity.reference_images:[];
  return refs.slice(0,3).map(url=>({type:'image_url',image_url:{url:String(url)}}));
}

function castEntryFromIdentity(identity,key){
  return {
    slot_key:key,
    display_name:identity?.character_card?.passport?.fiction_name||key,
    character_card:identity?.character_card||{},
    identity_lock:identity?.identity_lock||'',
    reference_images:Array.isArray(identity?.reference_images)?identity.reference_images:[],
    approved:Boolean(identity?.approved)
  };
}

function normalizeCast({identities={},cast=[]}={}){
  if(Array.isArray(cast)&&cast.length){
    return cast.map(x=>({
      slot_key:String(x?.slot_key||'').trim(),
      display_name:String(x?.display_name||x?.character_card?.passport?.fiction_name||x?.slot_key||'').trim(),
      character_card:x?.character_card||{},
      identity_lock:String(x?.identity_lock||''),
      reference_images:Array.isArray(x?.reference_images)?x.reference_images:[],
      approved:true
    })).filter(x=>x.slot_key);
  }
  return [
    castEntryFromIdentity(identities.A||{},'A'),
    castEntryFromIdentity(identities.B||{},'B')
  ].filter(x=>x.approved);
}

function cardLabel(entry){
  const card=entry?.character_card||{};
  const p=card.passport||{};
  const v=card.visual||{};
  return [
    `CAST SLOT ${entry.slot_key}`,
    p.fiction_name?`fiction name: ${p.fiction_name}`:'',
    p.age?`age: ${p.age}`:'',
    p.story_role?`story role: ${p.story_role}`:'',
    v.general_impression?`visual impression: ${v.general_impression}`:'',
    v.wardrobe_style?`baseline wardrobe: ${v.wardrobe_style}`:''
  ].filter(Boolean).join('; ');
}

function presentRoles(scene,castIndex){
  const list=Array.isArray(scene?.visual_scene?.characters_present)?scene.visual_scene.characters_present:[];
  const roles=list.map(x=>String(x||'').trim()).filter((x,i,a)=>x&&castIndex.has(x)&&a.indexOf(x)===i).slice(0,8);
  if(roles.length)return roles;
  return [...castIndex.keys()].slice(0,Math.min(2,castIndex.size));
}

function priorContinuity(previousVisual={}){
  return String(previousVisual?.meta?.continuity||previousVisual?.continuity||'').trim();
}

export function buildVisualPrompt({scene, identities={}, cast=[], previousVisual={}}) {
  const normalized=normalizeCast({identities,cast});
  if(!normalized.length) throw new Error('NOVEL2_CAST_NOT_READY');
  const castIndex=new Map(normalized.map(x=>[x.slot_key,x]));
  const visual=scene?.visual_scene&&typeof scene.visual_scene==='object'?scene.visual_scene:{};
  const roles=presentRoles(scene,castIndex);

  const characterLines=[];
  for(const role of roles){
    const entry=castIndex.get(role);
    if(!entry)continue;
    characterLines.push(`CHARACTER ${role}: ${cardLabel(entry)}`);
    if(entry.identity_lock)characterLines.push(`IDENTITY LOCK ${role}: ${entry.identity_lock}`);
  }

  return [
    'VERTICAL 9:16 cinematic editorial frame for an original adult dark-romance novel.',
    'ILLUSTRATE THE CURRENT STORY SCENE, NOT A GENERIC COUPLE PORTRAIT.',
    `LOCATION: ${String(visual.location||'').trim()||'derive the exact current location from the prose'}`,
    `LOCATION DETAILS: ${String(visual.location_details||'').trim()||'preserve architecture, materials, furniture, weather and recurring spatial details from the story'}`,
    `CHARACTERS PHYSICALLY PRESENT: ${roles.join(', ')}. Do not add cast members who are absent from this scene.`,
    `BLOCKING/ACTION: ${String(visual.blocking||scene?.visual_beat||'').trim()||'use the exact physical action and positions described in the prose'}`,
    `WARDROBE: ${String(visual.wardrobe||'').trim()||'inherit story-established clothing; no unexplained costume change'}`,
    `PROPS/OBJECTS: ${String(visual.props||'').trim()||'preserve story-established objects; invent no symbolic props'}`,
    `TIME/LIGHT: ${String(visual.time_light||'').trim()||'obey the prose and current continuity'}`,
    `CAMERA MOMENT: ${String(visual.camera_moment||scene?.visual_beat||'').trim()||'choose the most narratively important physical beat in this exact scene'}`,
    `PROSE GROUNDING: ${String(scene?.prose||'').slice(0,3200)}`,
    ...characterLines,
    roles.length>1?'MULTI-CHARACTER LOCK: preserve distinct identities, relative scale, wardrobe ownership and body continuity for every listed character. Never blend faces or duplicate a person.':'',
    priorContinuity(previousVisual)?`CONTINUITY LOCK: ${priorContinuity(previousVisual)}`:'CONTINUITY LOCK: preserve established face, hair, body, wardrobe, location layout and prop states from earlier illustrations.',
    'ENVIRONMENT IS REQUIRED: the image must clearly communicate where this scene happens. Avoid empty studio-like backgrounds unless the story actually takes place in one.',
    'CHARACTER ACCURACY IS REQUIRED: use identity references only for cast members physically present in this scene.',
    'The scene may contain more than two characters. Composition must remain readable and spatially plausible.',
    'BODY LANGUAGE: exact blocking implied by the scene; restrained, psychologically readable, anatomically plausible.',
    'CAMERA/LENS: 35–85 mm full-frame look depending on group size and location; plausible perspective; no wide-angle face distortion.',
    'COLOR/FILM: restrained premium cinematic realism, tactile materials, controlled highlights and detailed shadows.',
    'No text, no logo, no watermark. No extra characters unless the prose explicitly requires supporting people.',
    'Adult sensuality may be intense but keep the image non-explicit: no visible genitals, no explicit sexual act, no pornographic close-up.'
  ].filter(Boolean).join('\n');
}

export async function generateVisual({scene, identities={}, cast=[], previousVisual={}}) {
  const normalized=normalizeCast({identities,cast});
  const castIndex=new Map(normalized.map(x=>[x.slot_key,x]));
  const roles=presentRoles(scene,castIndex);
  const prompt=buildVisualPrompt({scene,identities,cast:normalized,previousVisual});
  const identityRefs=[];
  for(const role of roles){
    const entry=castIndex.get(role);
    if(entry)identityRefs.push(...refsOf(entry));
  }
  const continuityRef=previousVisual?.image_base64?[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+previousVisual.image_base64}}]:[];
  const references=[...identityRefs,...continuityRef].slice(0,12);
  const result=await imageCompletion({prompt,inputReferences:references});
  return {...result,prompt};
}

export async function generateCalibration({identity,role}) {
  if(!identity?.identity_lock) throw new Error('NOVEL2_IDENTITY_NOT_FOUND');
  const prompt=[
    `Create a neutral visual calibration sheet for PLAYER_${role}, one adult fictionalized character based only on the supplied reference images.`,
    'Six clean panels in one vertical editorial contact sheet: frontal portrait, three-quarter portrait, profile portrait, standing full body, seated natural pose, neutral close portrait.',
    'Simple warm gray studio background, neutral soft light, restrained plain clothing, no dramatic makeup, no costume, no stylization, no beauty filter.',
    'Use 65–85 mm portrait perspective and natural full-body perspective.',
    identity.identity_lock,
    'The SAME person must remain consistent in all six panels. Preserve nose geometry, jaw, eye spacing, hairline, build and body proportions.',
    'No text labels, no logos, no extra people.'
  ].join('\n');
  const result=await imageCompletion({prompt,inputReferences:refsOf(identity)});
  return {...result,prompt};
}

export async function generateSyntheticReference({identity,role}) {
  if(!identity?.identity_lock) throw new Error('NOVEL2_IDENTITY_NOT_FOUND');
  const card=identity.character_card||{};
  const visual=card.visual||{};
  const dna=card.visual_dna||{};
  const prompt=[
    `Create the canonical visual reference for ${role}, one fully fictional adult character.`,
    'This is the FIRST and authoritative appearance reference for the character. It must be visually specific, realistic and internally consistent.',
    'Layout: one vertical editorial character plate with a dominant waist-up three-quarter portrait plus one smaller full-body view of the SAME person. No grid labels, no text.',
    `CHARACTER: ${dna.short_visual_summary||visual.general_impression||''}`,
    `FACE/HAIR/BODY: ${visual.face||''}; ${visual.hair||''}; ${visual.eyes||''}; ${visual.build||''}; ${visual.posture_motion||''}`,
    `WARDROBE ANCHOR: ${dna.wardrobe_anchor||visual.wardrobe_style||'restrained contemporary clothing'}`,
    identity.identity_lock,
    'Neutral warm-gray studio, soft directional light, 65–85 mm portrait perspective, realistic skin texture, no beauty filter, no glamour retouching.',
    'The portrait and full-body view must depict the exact same person with identical face geometry, hairline, age, build and proportions.',
    'No text, no logos, no extra people.'
  ].join('\n');
  const result=await imageCompletion({prompt,inputReferences:[]});
  return {...result,prompt};
}
