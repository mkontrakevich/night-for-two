import {CATEGORIES,TEMPOS,LEVELS,PERMISSIONS,VARIETY_MATRIX,normalizeChoice} from './night-core.js';

const PRACTICES=Object.freeze(VARIETY_MATRIX.map(x=>x.practice));
const FALLBACK=Object.freeze({
  categories:['caress','play','desire'],
  tempo:'slow',
  level:'open',
  permissions:['words','embrace','kiss','touch','massage'],
  boundaries:['novel_intimacy']
});

function clean(v='',n=1200){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function stripFence(raw=''){return String(raw||'').replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();}
function safeArray(value,allowed,max=99){
  const allow=new Set(allowed);
  return [...new Set(Array.isArray(value)?value.map(String):[])].filter(x=>allow.has(x)).slice(0,max);
}
function asV3Choice(input={}){return {version:3,...normalizeChoice(input)};}
function fallbackSelection(){
  return asV3Choice({...FALLBACK});
}

export function sanitizeSyntheticPartnerChoice(input={}){
  try{
    const candidate={
      categories:safeArray(input.categories,CATEGORIES,3),
      tempo:TEMPOS.includes(String(input.tempo||''))?String(input.tempo):'slow',
      level:LEVELS.includes(String(input.level||''))?String(input.level):'open',
      permissions:safeArray(input.permissions,PERMISSIONS),
      boundaries:safeArray(input.boundaries,PRACTICES,3)
    };
    if(!candidate.categories.length)return fallbackSelection();
    if(!candidate.permissions.some(x=>['kiss','touch','massage','closer'].includes(x)))candidate.permissions=[...FALLBACK.permissions];
    return asV3Choice(candidate);
  }catch{return fallbackSelection();}
}

export async function simulateNightPartner({
  relationshipProfile={},
  loveStoryPassport={},
  history=[],
  mutualWishes=[],
  generate
}={}){
  if(typeof generate!=='function')return {selection:fallbackSelection(),source:'fallback',confidence:0};

  const context={
    relationshipProfile,
    loveStoryPassport,
    mutualWishes:Array.isArray(mutualWishes)?mutualWishes.slice(0,16):[],
    priorNightOutcomes:(Array.isArray(history)?history:[]).slice(0,20).map(x=>({
      practice:clean(x.practice,80),
      mechanic:clean(x.mechanic,80),
      context:clean(x.context,80),
      reaction:clean(x.reaction,40),
      semantic_summary:clean(x.semantic_summary,160)
    }))
  };

  try{
    const raw=await generate({
      contour:'wife',
      requestName:'night_synthetic_partner',
      skipDatabaseContext:true,
      temperature:.18,
      maxTokens:320,
      messages:[
        {
          role:'system',
          content:[
            'Ты создаёшь ТОЛЬКО тестовую симуляцию второго взрослого партнёра для QA приложения «Ночь на двоих».',
            'Это НЕ реальный человек, НЕ голос Снежи, НЕ её согласие и НЕ прогноз её фактического поведения.',
            'Опирайся только на переданный агрегированный контекст отношений и историю LoveStory.',
            'Не цитируй источники, не раскрывай внутренние наблюдения и не объясняй характер человека.',
            'Выбери правдоподобный, но консервативный набор тестовых ответов.',
            'Допустимые categories: caress, sex, experiment, play, desire, fantasy. Выбери 1–3.',
            'Допустимые tempo: slow, active, direct. Выбери одно.',
            'Допустимые level: familiar, open, bold, uninhibited. Выбери одно. При сомнении выбирай более низкий.',
            'Допустимые permissions: words, embrace, kiss, touch, massage, closer.',
            'Допустимые boundaries: compliment, embrace, kiss, massage, sensory, roleplay, intimacy, novel_intimacy.',
            'Границы тестовой симуляции не должны становиться разрешениями реального партнёра.',
            'Верни строго JSON без пояснений: {"categories":["..."],"tempo":"...","level":"...","permissions":["..."],"boundaries":["..."],"confidence":0.0}.'
          ].join(' ')
        },
        {role:'user',content:JSON.stringify(context)}
      ]
    });
    const parsed=JSON.parse(stripFence(raw));
    const selection=sanitizeSyntheticPartnerChoice(parsed);
    const confidence=Math.max(0,Math.min(.95,Number(parsed?.confidence)||0));
    return {selection,source:'ai_simulation',confidence};
  }catch(error){
    return {selection:fallbackSelection(),source:'fallback',confidence:0,error:clean(error?.message||error,180)};
  }
}
