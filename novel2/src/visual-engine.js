import {imageCompletion} from './ai.js';

function refsOf(identity) {
  const refs=Array.isArray(identity?.reference_images)?identity.reference_images:[];
  return refs.slice(0,4).map(url=>({type:'image_url',image_url:{url:String(url)}}));
}

export function buildVisualPrompt({scene, identities={}, previousVisual={}}) {
  const a=identities.A||{},b=identities.B||{};
  if(!a.approved||!b.approved) throw new Error('NOVEL2_IDENTITY_NOT_READY');

  const pairLock=[
    'PAIR LOCK: exactly two recurring adult protagonists when both are present',
    'PLAYER_A and PLAYER_B remain visually distinct',
    'preserve approved relative height and body scale',
    'never blend faces, swap identities, duplicate people, exchange hair or wardrobe',
    'hands and limbs belong to the correct person'
  ].join('; ');

  return [
    'VERTICAL 9:16 cinematic editorial frame for an original adult dark-romance novel.',
    `STORY/ACTION: ${String(scene?.visual_beat||scene?.prose||'').slice(0,1800)}`,
    'BODY LANGUAGE: exact blocking implied by the scene; restrained, psychologically readable, anatomically plausible.',
    'EMOTION/ATMOSPHERE: charged subtext, controlled tension, premium cinematic realism.',
    'WARDROBE/PROPS/TEXTURES: inherit story-established clothing and props; do not invent costume changes.',
    'ENVIRONMENT: preserve the current location architecture and recurring objects.',
    'LIGHT/TIME: obey the prose; cinematic practical light; realistic exposure.',
    'CAMERA/LENS: 50–85 mm full-frame look, plausible perspective, no wide-angle face distortion.',
    'COLOR/FILM: restrained premium film palette, tactile materials, controlled highlights and detailed shadows.',
    `IDENTITY LOCK A: ${a.identity_lock}`,
    `IDENTITY LOCK B: ${b.identity_lock}`,
    pairLock,
    previousVisual?.continuity ? `CONTINUITY LOCK: ${previousVisual.continuity}` : 'CONTINUITY LOCK: inherit prior face, hair, body, wardrobe, location and prop states.',
    'No text, no logo, no watermark. No extra characters unless the scene explicitly requires them.',
    'Adult sensuality may be intense but keep the image non-explicit: no visible genitals, no explicit sexual act, no pornographic close-up.'
  ].join('\n');
}

export async function generateVisual({scene, identities, previousVisual={}}) {
  const prompt=buildVisualPrompt({scene,identities,previousVisual});
  const continuityRef=previousVisual?.image_base64?[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+previousVisual.image_base64}}]:[];
  const references=[...refsOf(identities.A),...refsOf(identities.B),...continuityRef].slice(0,8);
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
