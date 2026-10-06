import {imageCompletion} from './ai.js';

function refsOf(identity) {
  const refs=Array.isArray(identity?.reference_images)?identity.reference_images:[];
  return refs.slice(0,4).map(url=>({type:'image_url',image_url:{url:String(url)}}));
}

function cardLabel(identity,role){
  const card=identity?.character_card||{};
  const p=card.passport||{};
  const v=card.visual||{};
  return [
    `PLAYER_${role}`,
    p.fiction_name?`fiction name: ${p.fiction_name}`:'',
    p.age?`age: ${p.age}`:'',
    p.story_role?`story role: ${p.story_role}`:'',
    v.general_impression?`visual impression: ${v.general_impression}`:'',
    v.wardrobe_style?`baseline wardrobe: ${v.wardrobe_style}`:''
  ].filter(Boolean).join('; ');
}

function presentRoles(scene){
  const list=Array.isArray(scene?.visual_scene?.characters_present)?scene.visual_scene.characters_present:[];
  const roles=list.map(x=>String(x||'').toUpperCase()).filter((x,i,a)=>['A','B'].includes(x)&&a.indexOf(x)===i);
  return roles.length?roles:['A','B'];
}

function priorContinuity(previousVisual={}){
  return String(previousVisual?.meta?.continuity||previousVisual?.continuity||'').trim();
}

export function buildVisualPrompt({scene, identities={}, previousVisual={}}) {
  const a=identities.A||{},b=identities.B||{};
  if(!a.approved||!b.approved) throw new Error('NOVEL2_IDENTITY_NOT_READY');

  const visual=scene?.visual_scene&&typeof scene.visual_scene==='object'?scene.visual_scene:{};
  const roles=presentRoles(scene);
  const pairLock=[
    'PAIR LOCK: PLAYER_A and PLAYER_B are recurring adult protagonists with distinct identities',
    'preserve approved relative height and body scale when both appear',
    'never blend faces, swap identities, duplicate people, exchange hair or wardrobe',
    'hands and limbs belong to the correct person'
  ].join('; ');

  const characterLines=[];
  if(roles.includes('A')){
    characterLines.push(`CHARACTER A: ${cardLabel(a,'A')}`);
    characterLines.push(`IDENTITY LOCK A: ${a.identity_lock}`);
  }
  if(roles.includes('B')){
    characterLines.push(`CHARACTER B: ${cardLabel(b,'B')}`);
    characterLines.push(`IDENTITY LOCK B: ${b.identity_lock}`);
  }

  return [
    'VERTICAL 9:16 cinematic editorial frame for an original adult dark-romance novel.',
    'ILLUSTRATE THE CURRENT STORY SCENE, NOT A GENERIC COUPLE PORTRAIT.',
    `LOCATION: ${String(visual.location||'').trim()||'derive the exact current location from the prose'}`,
    `LOCATION DETAILS: ${String(visual.location_details||'').trim()||'preserve architecture, materials, furniture, weather and recurring spatial details from the story'}`,
    `CHARACTERS PHYSICALLY PRESENT: ${roles.join(', ')}. Do not add the absent protagonist.`,
    `BLOCKING/ACTION: ${String(visual.blocking||scene?.visual_beat||'').trim()||'use the exact physical action and positions described in the prose'}`,
    `WARDROBE: ${String(visual.wardrobe||'').trim()||'inherit story-established clothing; no unexplained costume change'}`,
    `PROPS/OBJECTS: ${String(visual.props||'').trim()||'preserve story-established objects; invent no symbolic props'}`,
    `TIME/LIGHT: ${String(visual.time_light||'').trim()||'obey the prose and current continuity'}`,
    `CAMERA MOMENT: ${String(visual.camera_moment||scene?.visual_beat||'').trim()||'choose the most narratively important physical beat in this exact scene'}`,
    `PROSE GROUNDING: ${String(scene?.prose||'').slice(0,2600)}`,
    ...characterLines,
    roles.length===2?pairLock:'',
    priorContinuity(previousVisual)?`CONTINUITY LOCK: ${priorContinuity(previousVisual)}`:'CONTINUITY LOCK: preserve established face, hair, body, wardrobe, location layout and prop states from earlier illustrations.',
    'ENVIRONMENT IS REQUIRED: the image must clearly communicate where this scene happens. Avoid empty studio-like backgrounds unless the story actually takes place in one.',
    'CHARACTER ACCURACY IS REQUIRED: use the approved reference identity only for characters listed as physically present.',
    'BODY LANGUAGE: exact blocking implied by the scene; restrained, psychologically readable, anatomically plausible.',
    'CAMERA/LENS: 50–85 mm full-frame look where compatible with the location; plausible perspective; no wide-angle face distortion.',
    'COLOR/FILM: restrained premium cinematic realism, tactile materials, controlled highlights and detailed shadows.',
    'No text, no logo, no watermark. No extra characters unless the prose explicitly requires supporting people.',
    'Adult sensuality may be intense but keep the image non-explicit: no visible genitals, no explicit sexual act, no pornographic close-up.'
  ].filter(Boolean).join('\n');
}

export async function generateVisual({scene, identities, previousVisual={}}) {
  const prompt=buildVisualPrompt({scene,identities,previousVisual});
  const roles=presentRoles(scene);
  const identityRefs=[
    ...(roles.includes('A')?refsOf(identities.A):[]),
    ...(roles.includes('B')?refsOf(identities.B):[])
  ];
  const continuityRef=previousVisual?.image_base64?[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+previousVisual.image_base64}}]:[];
  const references=[...identityRefs,...continuityRef].slice(0,8);
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
    `Create the canonical visual reference for PLAYER_${role}, one fully fictional adult character.`,
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
