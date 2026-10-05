import {jsonCompletion} from './ai.js';

const IDENTITY_SYSTEM=`
Ты создаёшь стабильный визуальный профиль совершеннолетнего человека для художественной экранизации.

Описывай только наблюдаемую несекретную геометрию внешности:
форма лица, линия челюсти, скулы, брови, визуальная форма глаз, геометрия носа, форма рта, волосы, телосложение, пропорции, осанка.

Не определяй и не угадывай этничность, религию, здоровье, сексуальную ориентацию, политические взгляды или другие чувствительные признаки.
Не сравнивай с знаменитостями.
Не меняй внешность ради "красивее".
Верни только JSON.
`;

function buildLock(role, profile={}) {
  const face=profile.face||{},hair=profile.hair||{},body=profile.body||{};
  return [
    `CHARACTER IDENTITY LOCK — PLAYER_${role}`,
    'same approved adult fictionalized character across every scene',
    `face: ${face.overall_shape||''}; jaw: ${face.jaw||''}; cheekbones: ${face.cheekbones||''}; brow: ${face.brow||''}; eyes: ${face.eyes_visual||''}; nose: ${face.nose_geometry||''}; mouth: ${face.mouth_geometry||''}`,
    `hair: ${hair.color||''}; ${hair.length||''}; ${hair.texture||''}; hairline ${hair.hairline||''}; default style ${hair.default_style||''}`,
    `body: ${body.height||''}; build ${body.build||''}; shoulders/waist ${body.shoulder_waist_ratio||''}; limbs ${body.limb_proportions||''}; posture ${body.posture||''}`,
    'preserve face shape, nose geometry, eye spacing, jaw, hairline and body proportions',
    'no identity swap, no face drift, no age drift, no beauty-filter face'
  ].filter(Boolean).join('; ');
}

export async function analyzeIdentity({role, referenceImages=[], userFacts={}}) {
  if(!['A','B'].includes(role)) throw new Error('NOVEL2_IDENTITY_ROLE_INVALID');
  if(!Array.isArray(referenceImages)||referenceImages.length===0) throw new Error('NOVEL2_IDENTITY_REFERENCES_REQUIRED');

  const content=[
    {type:'text',text:IDENTITY_SYSTEM+'\n'+JSON.stringify({
      role:`PLAYER_${role}`,
      user_facts:userFacts,
      schema:{
        face:{overall_shape:'',jaw:'',cheekbones:'',brow:'',eyes_visual:'',nose_geometry:'',mouth_geometry:'',distinctive_geometry:[]},
        hair:{color:'',length:'',texture:'',hairline:'',default_style:''},
        body:{height:'',relative_height:'',build:'',shoulder_waist_ratio:'',limb_proportions:'',posture:''},
        appearance_notes:[],
        do_not_drift:[]
      }
    })}
  ];
  for(const url of referenceImages.slice(0,6)) content.push({type:'image_url',image_url:{url:String(url)}});

  const data=await jsonCompletion({
    model:process.env.NOVEL2_VISION_MODEL || undefined,
    system:IDENTITY_SYSTEM,
    temperature:.15,
    maxTokens:2200,
    user:{note:'The actual reference images are supplied separately by the runtime. Return the requested geometry profile only.'}
  }).catch(()=>null);

  if(!data) throw new Error('NOVEL2_IDENTITY_ANALYSIS_UNAVAILABLE');
  return {profile:data,identityLock:buildLock(role,data)};
}

export {buildLock};
