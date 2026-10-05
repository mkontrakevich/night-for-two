import {visionJsonCompletion} from './ai.js';

const IDENTITY_SYSTEM=`
Ты создаёшь стабильный визуальный профиль совершеннолетнего человека для художественной экранизации.

Описывай только наблюдаемую несекретную геометрию внешности:
форма лица, линия челюсти, скулы, брови, визуальная форма глаз, геометрия носа, форма рта, волосы, телосложение, пропорции, осанка.

Не определяй и не угадывай этничность, религию, здоровье, сексуальную ориентацию, политические взгляды или другие чувствительные признаки.
Не сравнивай с знаменитостями.
Не меняй внешность ради "красивее".
Если ракурсы противоречат друг другу, выбирай признаки, подтверждённые несколькими изображениями.
Верни только JSON по заданной схеме.
`;

function buildLock(role, profile={}) {
  const face=profile.face||{},hair=profile.hair||{},body=profile.body||{};
  return [
    `CHARACTER IDENTITY LOCK — PLAYER_${role}`,
    'same approved adult fictionalized character across every scene',
    `face shape ${face.overall_shape||'stable'}; jaw ${face.jaw||'stable'}; cheekbones ${face.cheekbones||'stable'}; brow ${face.brow||'stable'}; eyes ${face.eyes_visual||'stable'}; nose geometry ${face.nose_geometry||'stable'}; mouth geometry ${face.mouth_geometry||'stable'}`,
    `hair ${hair.color||''} ${hair.length||''} ${hair.texture||''}; hairline ${hair.hairline||'stable'}; default style ${hair.default_style||'stable'}`,
    `body ${body.height||''}; relative height ${body.relative_height||''}; build ${body.build||'stable'}; shoulder-waist ratio ${body.shoulder_waist_ratio||'stable'}; limb proportions ${body.limb_proportions||'stable'}; posture ${body.posture||'stable'}`,
    Array.isArray(profile.distinctive_geometry)&&profile.distinctive_geometry.length?`distinctive geometry: ${profile.distinctive_geometry.join(', ')}`:'',
    'preserve face shape, nose geometry, eye spacing, jaw, hairline, body proportions and relative scale',
    'do not beautify into a different person',
    'no identity swap, no face drift, no profile drift, no age drift, no beauty-filter face'
  ].filter(Boolean).join('; ');
}

export async function analyzeIdentity({role, referenceImages=[], userFacts={}}) {
  if(!['A','B'].includes(role)) throw new Error('NOVEL2_IDENTITY_ROLE_INVALID');
  if(!Array.isArray(referenceImages)||referenceImages.length<2) throw new Error('NOVEL2_IDENTITY_REFERENCES_REQUIRED');

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
    do_not_drift:[]
  };

  const profile=await visionJsonCompletion({
    system:IDENTITY_SYSTEM,
    temperature:.08,
    maxTokens:2400,
    images:referenceImages,
    text:JSON.stringify({
      character_id:`PLAYER_${role}`,
      user_facts:userFacts,
      task:'Сведи все ракурсы одного человека в единый устойчивый Visual Identity Profile.',
      output_schema:schema
    })
  });

  if(!profile?.face||!profile?.hair||!profile?.body) throw new Error('NOVEL2_IDENTITY_PROFILE_INVALID');
  return {profile,identityLock:buildLock(role,profile)};
}

export {buildLock};
