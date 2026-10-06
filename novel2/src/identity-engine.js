import {visionJsonCompletion} from './ai.js';

const IDENTITY_SYSTEM=`
Ты создаёшь стабильный Visual Identity Profile совершеннолетнего человека для художественной экранизации.

На вход могут прийти ЛЮБЫЕ имеющиеся фотографии: одна, несколько, разные ракурсы, разные годы, одежда и освещение.
Твоя задача — извлечь только устойчивые наблюдаемые признаки и отдельно отметить то, чего нельзя надёжно установить.

Описывай только визуальную геометрию:
форма лица, линия челюсти, скулы, брови, визуальная форма и посадка глаз, геометрия носа, форма рта, волосы, телосложение, пропорции, осанка.

НЕЛЬЗЯ
— угадывать этничность, религию, здоровье, сексуальную ориентацию, политические взгляды и другие чувствительные признаки;
— сравнивать с знаменитостями;
— "улучшать" человека в сторону другого лица;
— превращать неизвестное в уверенный факт.

Если фото противоречат друг другу:
— повторяющиеся признаки считаются core;
— переменные признаки считаются scene-variable;
— невидимые/сомнительные признаки идут в unknown_traits.

Верни только JSON по заданной схеме.
`;

const PROFILE_SCHEMA={
  face:{
    overall_shape:'',jaw:'',cheekbones:'',brow:'',eyes_visual:'',
    nose_geometry:'',mouth_geometry:''
  },
  hair:{color:'',length:'',texture:'',hairline:'',default_style:''},
  body:{
    height:'',relative_height:'',build:'',
    shoulder_waist_ratio:'',limb_proportions:'',posture:''
  },
  distinctive_geometry:[],
  appearance_notes:[],
  stable_core_traits:[],
  variable_traits:[],
  unknown_traits:[],
  reference_coverage:{
    face_confidence:'low|medium|high',
    profile_confidence:'low|medium|high',
    body_confidence:'low|medium|high',
    missing_views:[]
  },
  do_not_drift:[]
};

function asObject(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
}
function asArray(value){
  return Array.isArray(value)?value.map(x=>String(x||'').trim()).filter(Boolean).slice(0,24):[];
}
function asText(value,max=500){
  return typeof value==='string'?value.trim().slice(0,max):'';
}
function pick(obj,...keys){
  for(const key of keys){
    const value=obj?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return '';
}
function findProfileObject(raw){
  if(Array.isArray(raw))raw=raw[0];
  const root=asObject(raw);
  const direct=[
    root,
    root.profile,
    root.visual_profile,
    root.identity_profile,
    root.visual_identity_profile,
    root.visualIdentityProfile,
    root.result,
    root.data
  ].map(asObject);
  for(const candidate of direct){
    if(candidate.face||candidate.hair||candidate.body||candidate.stable_core_traits||candidate.distinctive_geometry)return candidate;
  }
  for(const value of Object.values(root)){
    const candidate=asObject(value);
    if(candidate.face||candidate.hair||candidate.body||candidate.stable_core_traits||candidate.distinctive_geometry)return candidate;
  }
  return root;
}
function confidence(value,fallback='low'){
  const v=String(value||'').toLowerCase();
  return ['low','medium','high'].includes(v)?v:fallback;
}

export function normalizeIdentityProfile(raw={}){
  const source=findProfileObject(raw);
  const face=asObject(source.face);
  const hair=asObject(source.hair);
  const body=asObject(source.body);
  const coverage=asObject(source.reference_coverage||source.coverage);

  const profile={
    face:{
      overall_shape:asText(pick(face,'overall_shape','shape','face_shape')),
      jaw:asText(pick(face,'jaw','jawline')),
      cheekbones:asText(pick(face,'cheekbones','cheekbone_structure')),
      brow:asText(pick(face,'brow','brows','eyebrows')),
      eyes_visual:asText(pick(face,'eyes_visual','eyes','eye_shape')),
      nose_geometry:asText(pick(face,'nose_geometry','nose','nose_shape')),
      mouth_geometry:asText(pick(face,'mouth_geometry','mouth','lips'))
    },
    hair:{
      color:asText(pick(hair,'color','hair_color')),
      length:asText(pick(hair,'length','hair_length')),
      texture:asText(pick(hair,'texture','hair_texture')),
      hairline:asText(pick(hair,'hairline')),
      default_style:asText(pick(hair,'default_style','style','hairstyle'))
    },
    body:{
      height:asText(pick(body,'height','height_impression')),
      relative_height:asText(pick(body,'relative_height')),
      build:asText(pick(body,'build','body_type')),
      shoulder_waist_ratio:asText(pick(body,'shoulder_waist_ratio')),
      limb_proportions:asText(pick(body,'limb_proportions')),
      posture:asText(pick(body,'posture'))
    },
    distinctive_geometry:asArray(source.distinctive_geometry||source.distinctive_features),
    appearance_notes:asArray(source.appearance_notes||source.notes),
    stable_core_traits:asArray(source.stable_core_traits||source.core_traits),
    variable_traits:asArray(source.variable_traits||source.scene_variable_traits),
    unknown_traits:asArray(source.unknown_traits||source.unknowns),
    reference_coverage:{
      face_confidence:confidence(coverage.face_confidence,face&&Object.keys(face).length?'medium':'low'),
      profile_confidence:confidence(coverage.profile_confidence,'low'),
      body_confidence:confidence(coverage.body_confidence,body&&Object.keys(body).length?'medium':'low'),
      missing_views:asArray(coverage.missing_views)
    },
    do_not_drift:asArray(source.do_not_drift||source.consistency_rules)
  };

  if(!Object.values(profile.body).some(Boolean)&&!profile.unknown_traits.includes('body proportions')){
    profile.unknown_traits.push('body proportions');
  }
  if(!profile.face.overall_shape&&!profile.face.nose_geometry&&!profile.face.eyes_visual&&!profile.unknown_traits.includes('full facial geometry')){
    profile.unknown_traits.push('full facial geometry');
  }
  return profile;
}

function evidenceScore(profile){
  const fields=[
    ...Object.values(profile.face||{}),
    ...Object.values(profile.hair||{}),
    ...Object.values(profile.body||{})
  ].filter(Boolean).length;
  return fields+(profile.stable_core_traits?.length||0)+(profile.distinctive_geometry?.length||0);
}

function buildLock(role, profile={}) {
  const face=profile.face||{},hair=profile.hair||{},body=profile.body||{};
  return [
    `CHARACTER IDENTITY LOCK — PLAYER_${role}`,
    'same approved adult fictionalized character across every scene',
    `face shape ${face.overall_shape||'unknown'}; jaw ${face.jaw||'unknown'}; cheekbones ${face.cheekbones||'unknown'}; brow ${face.brow||'unknown'}; eyes ${face.eyes_visual||'unknown'}; nose geometry ${face.nose_geometry||'unknown'}; mouth geometry ${face.mouth_geometry||'unknown'}`,
    `hair ${hair.color||'unknown'} ${hair.length||''} ${hair.texture||''}; hairline ${hair.hairline||'unknown'}; default style ${hair.default_style||'unknown'}`,
    `body ${body.height||'unknown'}; relative height ${body.relative_height||'unknown'}; build ${body.build||'unknown'}; shoulder-waist ratio ${body.shoulder_waist_ratio||'unknown'}; limb proportions ${body.limb_proportions||'unknown'}; posture ${body.posture||'unknown'}`,
    Array.isArray(profile.distinctive_geometry)&&profile.distinctive_geometry.length?`distinctive geometry: ${profile.distinctive_geometry.join(', ')}`:'',
    Array.isArray(profile.unknown_traits)&&profile.unknown_traits.length?`do not invent unknown traits: ${profile.unknown_traits.join(', ')}`:'',
    'preserve all observed face geometry, hairline, build and relative scale',
    'unknown traits must stay unspecified until calibration or additional references resolve them',
    'do not beautify into a different person',
    'no identity swap, no face drift, no profile drift, no age drift, no beauty-filter face'
  ].filter(Boolean).join('; ');
}

async function requestProfile({role,referenceImages,userFacts,repairOf=null}){
  return visionJsonCompletion({
    system:IDENTITY_SYSTEM+(repairOf?'

ПРЕДЫДУЩИЙ ОТВЕТ НЕ СООТВЕТСТВОВАЛ СХЕМЕ. Верни объект с КЛЮЧАМИ face, hair, body, distinctive_geometry, appearance_notes, stable_core_traits, variable_traits, unknown_traits, reference_coverage, do_not_drift. Даже если часть внешности не видна, НЕ опускай раздел — оставь его поля пустыми и добавь неизвестное в unknown_traits.':''),
    temperature:repairOf?0:.08,
    maxTokens:3000,
    images:referenceImages,
    text:JSON.stringify({
      character_id:`PLAYER_${role}`,
      user_facts:userFacts,
      reference_count:referenceImages.length,
      task:'Сведи все доступные фото одного человека в единый устойчивый Visual Identity Profile. Не требуй идеального набора ракурсов: используй то, что есть, а недостаток данных явно пометь.',
      output_schema:PROFILE_SCHEMA,
      previous_invalid_output:repairOf||undefined
    })
  });
}

export async function analyzeIdentity({role, referenceImages=[], userFacts={}}) {
  if(!['A','B'].includes(role)) throw new Error('NOVEL2_IDENTITY_ROLE_INVALID');
  if(!Array.isArray(referenceImages)||referenceImages.length<1) throw new Error('NOVEL2_IDENTITY_REFERENCES_REQUIRED');

  const firstRaw=await requestProfile({role,referenceImages,userFacts});
  let profile=normalizeIdentityProfile(firstRaw);

  // Arbitrary user photos are allowed. Missing profile/body views are not an
  // error: they become unknown traits. Only retry when the model returned
  // almost no usable visual evidence at all.
  if(evidenceScore(profile)<2){
    const repairedRaw=await requestProfile({
      role,
      referenceImages,
      userFacts,
      repairOf:firstRaw
    });
    profile=normalizeIdentityProfile(repairedRaw);
  }

  if(evidenceScore(profile)<1) throw new Error('NOVEL2_IDENTITY_ANALYSIS_EMPTY');
  return {profile,identityLock:buildLock(role,profile)};
}

export {buildLock};
