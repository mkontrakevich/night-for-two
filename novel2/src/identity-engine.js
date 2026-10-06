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

function buildLock(role, profile={}) {
  const face=profile.face||{},hair=profile.hair||{},body=profile.body||{};
  return [
    `CHARACTER IDENTITY LOCK — PLAYER_${role}`,
    'same approved adult fictionalized character across every scene',
    `face shape ${face.overall_shape||'stable'}; jaw ${face.jaw||'stable'}; cheekbones ${face.cheekbones||'stable'}; brow ${face.brow||'stable'}; eyes ${face.eyes_visual||'stable'}; nose geometry ${face.nose_geometry||'stable'}; mouth geometry ${face.mouth_geometry||'stable'}`,
    `hair ${hair.color||''} ${hair.length||''} ${hair.texture||''}; hairline ${hair.hairline||'stable'}; default style ${hair.default_style||'stable'}`,
    `body ${body.height||''}; relative height ${body.relative_height||''}; build ${body.build||'unknown'}; shoulder-waist ratio ${body.shoulder_waist_ratio||'unknown'}; limb proportions ${body.limb_proportions||'unknown'}; posture ${body.posture||'stable'}`,
    Array.isArray(profile.distinctive_geometry)&&profile.distinctive_geometry.length?`distinctive geometry: ${profile.distinctive_geometry.join(', ')}`:'',
    Array.isArray(profile.unknown_traits)&&profile.unknown_traits.length?`do not invent unknown traits: ${profile.unknown_traits.join(', ')}`:'',
    'preserve face shape, nose geometry, eye spacing, jaw, hairline, body proportions and relative scale',
    'do not beautify into a different person',
    'no identity swap, no face drift, no profile drift, no age drift, no beauty-filter face'
  ].filter(Boolean).join('; ');
}

export async function analyzeIdentity({role, referenceImages=[], userFacts={}}) {
  if(!['A','B'].includes(role)) throw new Error('NOVEL2_IDENTITY_ROLE_INVALID');
  if(!Array.isArray(referenceImages)||referenceImages.length<1) throw new Error('NOVEL2_IDENTITY_REFERENCES_REQUIRED');

  const schema={
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

  const profile=await visionJsonCompletion({
    system:IDENTITY_SYSTEM,
    temperature:.08,
    maxTokens:2800,
    images:referenceImages,
    text:JSON.stringify({
      character_id:`PLAYER_${role}`,
      user_facts:userFacts,
      reference_count:referenceImages.length,
      task:'Сведи все доступные фото одного человека в единый устойчивый Visual Identity Profile. Не требуй идеального набора ракурсов: используй то, что есть, а недостаток данных явно пометь.',
      output_schema:schema
    })
  });

  if(!profile?.face||!profile?.hair||!profile?.body) throw new Error('NOVEL2_IDENTITY_PROFILE_INVALID');
  return {profile,identityLock:buildLock(role,profile)};
}

export {buildLock};
