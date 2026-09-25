import {nightReferencePromptDigest} from './night-reference-collection.js';
import {createHash} from 'node:crypto';

export const CATEGORIES=Object.freeze(['caress','sex','experiment','play','desire','fantasy']);
export const TEMPOS=Object.freeze(['slow','active','direct']);
export const LEVELS=Object.freeze(['familiar','open','bold','uninhibited']);
export const PERMISSIONS=Object.freeze(['words','embrace','kiss','touch','massage','closer']);

// Dimensions and practice identifiers, never prewritten assignments.
export const VARIETY_MATRIX=Object.freeze([
  {practice:'compliment',categories:['desire','play'],permission:'words',level:0,mechanics:['exchange','private_prompt','role_lead'],contexts:['home','private']},
  {practice:'embrace',categories:['caress','desire'],permission:'embrace',level:0,mechanics:['mutual','alternating','slow_build'],contexts:['home','private']},
  {practice:'kiss',categories:['caress','play','desire'],permission:'kiss',level:0,mechanics:['alternating','pace_control','role_lead'],contexts:['home','private']},
  {practice:'teasing',categories:['play','desire','caress'],permission:'touch',level:1,mechanics:['slow_build','role_lead','alternating'],contexts:['home','private']},
  {practice:'massage',categories:['caress','desire'],permission:'massage',level:1,mechanics:['alternating','guided','role_lead'],contexts:['home','private']},
  {practice:'mutual_touch',categories:['caress','sex','desire'],permission:'touch',level:1,mechanics:['mutual','pace_control','alternating'],contexts:['private']},
  {practice:'sensory',categories:['experiment','caress','play'],permission:'touch',level:1,mechanics:['sensory_contrast','guided','role_lead'],contexts:['home','private']},
  {practice:'outfit_visual',categories:['fantasy','desire','play'],permission:'words',level:1,mechanics:['outfit_visual','reveal_card','role_lead'],contexts:['home','private']},
  {practice:'roleplay',categories:['fantasy','play'],permission:'words',level:1,mechanics:['role_switch','private_prompt','role_lead'],contexts:['home','private']},
  {practice:'intimacy',categories:['sex','desire'],permission:'closer',level:2,mechanics:['guided','mutual','pace_control','role_lead'],contexts:['private']},
  {practice:'oral_intimacy',categories:['sex','desire','experiment'],permission:'closer',level:2,mechanics:['alternating','role_lead','pace_control'],contexts:['private']},
  {practice:'position_change',categories:['sex','experiment'],permission:'closer',level:2,mechanics:['novel_position','choice','role_lead'],contexts:['private']},
  {practice:'shower_scene',categories:['sex','caress','experiment'],permission:'closer',level:2,mechanics:['location_shift','sensory_contrast','role_lead'],contexts:['private']},
  {practice:'fantasy_enactment',categories:['fantasy','sex','play'],permission:'closer',level:2,mechanics:['role_switch','role_lead','reveal_card'],contexts:['private']},
  {practice:'novel_intimacy',categories:['sex','experiment','fantasy'],permission:'closer',level:3,mechanics:['novel_position','role_switch','heat_progression','role_lead'],contexts:['private']},
  {practice:'dominance_scene',categories:['sex','fantasy','play'],permission:'closer',level:3,mechanics:['role_lead','role_switch','heat_progression'],contexts:['private']},
  {practice:'hardcore_variation',categories:['sex','experiment','fantasy'],permission:'closer',level:3,mechanics:['heat_progression','novel_position','role_lead'],contexts:['private']}
]);

const uniq=(xs,allow)=>[...new Set(Array.isArray(xs)?xs:[])].filter(x=>allow.includes(x));
export function normalizeChoice(input={}){
  const categories=uniq(input.categories,CATEGORIES).slice(0,3);
  const permissions=uniq(input.permissions,PERMISSIONS);
  const boundaries=uniq(input.boundaries,VARIETY_MATRIX.map(x=>x.practice));
  if(!categories.length)throw new Error('NIGHT_CATEGORIES_REQUIRED');
  if(!TEMPOS.includes(input.tempo)||!LEVELS.includes(input.level))throw new Error('NIGHT_CHOICE_INVALID');
  return {categories,tempo:input.tempo,level:input.level,permissions,boundaries};
}

export function compatibleSpace(aInput,bInput){
  const a=normalizeChoice(aInput),b=normalizeChoice(bInput);
  const ceiling=Math.min(LEVELS.indexOf(a.level),LEVELS.indexOf(b.level));
  const permissions=a.permissions.filter(x=>b.permissions.includes(x));
  const shared=a.categories.filter(x=>b.categories.includes(x));
  const wanted=[...new Set([...a.categories,...b.categories])];
  const candidates=VARIETY_MATRIX.filter(x=>x.level<=ceiling&&permissions.includes(x.permission)&&!a.boundaries.includes(x.practice)&&!b.boundaries.includes(x.practice)&&x.categories.some(c=>wanted.includes(c)));
  // A one-sided category is a possible discussion topic, never assumed mutual consent.
  return {ceiling,permissions,sharedCategories:shared,tempos:[a.tempo,b.tempo],candidates:candidates.map(x=>({...x,match:x.categories.some(c=>shared.includes(c))?'shared':'compatible'}))};
}

export function semanticSignature({practice,mechanic,context,dynamic='mutual'}={}){
  return [practice,mechanic,context,dynamic].map(x=>String(x||'').toLowerCase().trim()).join('|');
}

export function rankNovelty(space,history=[]){
  const rejected=new Set(history.filter(x=>x.reaction==='no').map(x=>x.practice));
  const recent=new Set(history.slice(0,12).map(x=>x.signature));
  const seen=new Map();for(const h of history)seen.set(h.practice,(seen.get(h.practice)||0)+1);
  const options=[];
  for(const x of space.candidates){if(rejected.has(x.practice))continue;
    for(const mechanic of x.mechanics)for(const context of x.contexts){const signature=semanticSignature({practice:x.practice,mechanic,context});if(recent.has(signature))continue;
      options.push({...x,mechanic,context,signature,novelty:1/(1+(seen.get(x.practice)||0)),score:(x.match==='shared'?2:0)+1/(1+(seen.get(x.practice)||0))});
    }
  }
  return options.sort((a,b)=>b.score-a.score||a.signature.localeCompare(b.signature));
}

export function validateIdea(raw,allowed,history=[]){
  const idea=typeof raw==='string'?JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,'')):raw;
  const row=allowed.find(x=>x.signature===idea?.signature);
  if(!row)throw new Error('NIGHT_GENERATION_OUTSIDE_BOUNDARIES');
  const title=String(idea.title||'').trim(),text=String(idea.text||'').trim(),semanticSummary=String(idea.semantic_summary||'').trim();
  if(title.length<3||title.length>80||text.length<30||text.length>600)throw new Error('NIGHT_GENERATION_INVALID');
  if(semanticSummary.length<8||semanticSummary.length>140)throw new Error('NIGHT_GENERATION_INVALID');
  const normalized=text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const fingerprint=createHash('sha256').update(normalized).digest('hex').slice(0,24);
  if(history.some(x=>x.fingerprint===fingerprint))throw new Error('NIGHT_GENERATION_REPEATED');
  return {signature:row.signature,practice:row.practice,mechanic:row.mechanic,context:row.context,categories:row.categories,title,text,semanticSummary,fingerprint,level:row.level};
}

export async function generatePersonalIdea({space,history=[],preferences={},generate}){
  const allowed=rankNovelty(space,history).slice(0,28);
  if(!allowed.length)throw new Error('NIGHT_NO_SAFE_NOVEL_OPTION');
  if(typeof generate!=='function')throw new Error('NIGHT_AI_UNAVAILABLE');
  const prompt={
    eveningMode:preferences.eveningMode||'sensual',
    stage:preferences.stage||'main',
    noveltyNonce:preferences.noveltyNonce||'',
    sharedCategories:space.sharedCategories,
    tempos:space.tempos,
    ceiling:space.ceiling,
    options:allowed.map(({signature,practice,mechanic,context,categories,level,permission})=>({signature,practice,mechanic,context,categories,level,permission})),
    referenceMechanics:nightReferencePromptDigest(),
    relationshipProfile:preferences.relationshipProfile||{},
    couplePassport:preferences.couple||[],
    ownerPassport:preferences.owner||[],
    partnerPassport:preferences.partner||[],
    hypotheses:preferences.hypotheses||[],
    mutualWishes:preferences.mutualWishes||[],
    storyInterview:preferences.storyInterview||{},
    storyAnswers:preferences.storyAnswers||{},
    previous:history.slice(0,30).map(({practice,mechanic,context,reaction,semantic_summary,signature})=>({practice,mechanic,context,reaction,semantic_summary,signature}))
  };
  const raw=await generate({
    contour:'wife',
    requestName:'night_personal_idea',
    skipDatabaseContext:false,
    temperature:.82,
    maxTokens:850,
    messages:[
      {role:'system',content:'Ты — сценарист приватного вечера для двух совершеннолетних партнёров. Твоя задача — НЕ предлагать им самим что-либо придумывать, выбирать тему, обсуждать идею или сочинять продолжение. Ты сам создаёшь готовый конкретный сценарий действия на текущий этап вечера. Выбирай только одну точную signature из options и строго оставайся внутри её permission, level, practice, mechanic и context. eveningMode задаёт уровень вечера: romance = Нежность — романтика, ласка, медленный темп; sensual = Страсть — секс, желание и телесность; bold = Эксперимент — новые ощущения, роли, позиции и необычные сценарии; hardcore = Хардкор — максимальная интенсивность внутри явно разрешённых обоими границ. stage задаёт место в дуге вечера: warmup, main или peak. Сценарий должен быть взрослым, конкретным, выполнимым здесь и сейчас и не выглядеть как психологическое упражнение, детская игра или абстрактное пожелание. Не используй формулировки вроде «придумайте», «обсудите, что бы вы хотели», «выберите сами сценарий», «представьте ситуацию». Вместо этого дай уже готовую последовательность действий. storyInterview — общий каркас одной истории, который видят оба партнёра. storyAnswers.a и storyAnswers.b — их приватные ответы на одинаковые селекторы этой истории. Собери из ОБОИХ наборов один общий сценарий: совпадения усиливай; если ответы различаются, выбирай совместимый компромисс или более мягкую из двух трактовок, не раскрывая, кто что выбрал. Сценарий должен ощущаться как продолжение storyInterview, а не как отдельная случайная карточка. Используй relationshipProfile, couplePassport, mutualWishes и контекст пары только для персонализации тона, темпа и деталей; не цитируй переписку, не раскрывай скрытые выводы и не объясняй, почему выбрал именно это. previous — уже выданные сценарии: новый текст должен отличаться по действию, механике и формулировке, а не быть перефразировкой. referenceMechanics — библиотека композиционных приёмов, а не готовые задания; не копируй их дословно. Согласие и текущие ограничения важнее интенсивности режима. Верни только JSON: {"signature":"...","title":"короткое название","text":"конкретный готовый сценарий на этот этап вечера, 2–5 предложений","semantic_summary":"нейтральное краткое описание фактического действия без личных деталей"}.'},
      {role:'user',content:JSON.stringify(prompt)}
    ]
  });
  const idea=validateIdea(raw,allowed,history);
  const auditRaw=await generate({contour:'wife',requestName:'night_personal_safety',skipDatabaseContext:true,temperature:0,maxTokens:160,messages:[
    {role:'system',content:'Проверь готовый сценарий строго. safe=true только если он описывает конкретное действие внутри выбранных practice/mechanic/context/permission/level, не просит пару самим придумать сценарий, не выходит за сегодняшние разрешения, не содержит принуждения, опасных действий или публичного сексуального действия, не раскрывает приватные данные и не повторяет prior_actions по смыслу. При сомнении safe=false. Верни только JSON {"safe":true|false,"signature":"..."}.'},
    {role:'user',content:JSON.stringify({idea:{title:idea.title,text:idea.text,semantic_summary:idea.semanticSummary,signature:idea.signature},permission:allowed.find(x=>x.signature===idea.signature)?.permission,level:idea.level,practice:idea.practice,mechanic:idea.mechanic,context:idea.context,storyInterview:preferences.storyInterview||{},storyAnswers:preferences.storyAnswers||{},prior_actions:history.slice(0,40).map(x=>x.semantic_summary).filter(Boolean)})}
  ]});
  let audit;try{audit=typeof auditRaw==='string'?JSON.parse(auditRaw.replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/g,'')):auditRaw;}catch{throw new Error('NIGHT_GENERATION_UNVERIFIED');}
  if(audit?.safe!==true||audit?.signature!==idea.signature)throw new Error('NIGHT_GENERATION_UNVERIFIED');
  return idea;
}
