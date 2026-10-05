import {imageCompletion} from './ai.js';

function refsOf(identity) {
  const refs=Array.isArray(identity?.reference_images)?identity.reference_images:[];
  return refs.slice(0,4).map(url=>({type:'image_url',image_url:{url:String(url)}}));
}

export function buildVisualPrompt({scene, identities={}, previousVisual={}}) {
  const a=identities.A||{},b=identities.B||{};
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
    a.identity_lock ? `IDENTITY LOCK A: ${a.identity_lock}` : 'IDENTITY A: stable recurring adult protagonist A.',
    b.identity_lock ? `IDENTITY LOCK B: ${b.identity_lock}` : 'IDENTITY B: stable recurring adult protagonist B.',
    pairLock,
    previousVisual?.continuity ? `CONTINUITY LOCK: ${previousVisual.continuity}` : 'CONTINUITY LOCK: inherit prior face, hair, body, wardrobe, location and prop states.',
    'No text, no logo, no watermark. No extra characters unless the scene explicitly requires them.',
    'Adult sensuality may be intense but keep the image non-explicit: no visible genitals, no explicit sexual act, no pornographic close-up.'
  ].join('\n');
}

export async function generateVisual({scene, identities, previousVisual={}}) {
  const prompt=buildVisualPrompt({scene,identities,previousVisual});
  const references=[...refsOf(identities.A),...refsOf(identities.B)].slice(0,8);
  const result=await imageCompletion({prompt,inputReferences:references});
  return {...result,prompt};
}
