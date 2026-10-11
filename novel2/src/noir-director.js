// Interactive Novel 2.0 — finite noir director contract.
// The model writes the fiction, this module owns pacing and stopping rules.
export const NOIR_EPISODE_BEATS=5;
export const NOIR_EPISODE_COUNT=6;
export const NOIR_MAX_SCENES=NOIR_EPISODE_BEATS*NOIR_EPISODE_COUNT;

const STAGES=[
  {id:'arrival',purpose:'Завязка и приглашение в конфликт. В конце конкретный вопрос с последствиями.'},
  {id:'temptation',purpose:'Раскрыть мотив и новые сведения; ответ игрока явно влияет на сцену.'},
  {id:'pressure',purpose:'Поворот, усложнение отношений и риск. Событие меняет условия.'},
  {id:'decision',purpose:'Решение с альтернативами и необратимыми последствиями.'},
  {id:'payoff',purpose:'Закрыть локальный конфликт эпизода, выдать важный результат и крючок следующего.'}
];
export function noirBeatPlan(sceneNumber=1){
  const n=Math.max(1,Math.floor(Number(sceneNumber)||1));
  if(n>NOIR_MAX_SCENES){
    return {episode:NOIR_EPISODE_COUNT,beat:NOIR_EPISODE_BEATS,
      beats_per_episode:NOIR_EPISODE_BEATS,episode_count:NOIR_EPISODE_COUNT,
      narrative_stage:'finale',finale:true,novel_finished:true,
      directive:'Окончательно разреши главную драматургическую дилемму, заверши все ключевые линии и напиши финальный образ. Не оставляй вопроса пользователю и не обещай очередной эпизод.'};
  }
  const episode=Math.ceil(n/NOIR_EPISODE_BEATS);
  const beat=(n-1)%NOIR_EPISODE_BEATS+1;
  const stage=STAGES[beat-1];
  return {episode,beat,beats_per_episode:NOIR_EPISODE_BEATS,episode_count:NOIR_EPISODE_COUNT,
    narrative_stage:stage.id,finale:false,novel_finished:false,
    directive:stage.purpose+(episode===NOIR_EPISODE_COUNT?' Это финальный сезон: веди сюжет к разрешению основного конфликта.':'')};
}
export function noirPartnerPlan(plan=noirBeatPlan(1)){
  const {episode,beat}=plan;
  // Fictional identity may be unveiled during the story. Never automatically
  // reveal a real guest's legal name, photo, contact info or account identity.
  const phase=episode<=1?'anonymous':episode===2?'clues':(episode===3&&beat<4)?'approach':'fictional_reveal';
  return {phase,
    allow_fictional_identity_reveal:phase==='fictional_reveal',
    allow_real_guest_identity_reveal:false,
    directive:phase==='anonymous'
      ?'Не раскрывай полное имя, лицо и биографию второго игрового героя. Лишь следы присутствия, голос, предметы и решения.'
      :phase==='clues'
        ?'Давай последовательные достоверные намёки на литературную роль партнёра, не раскрывай его полностью.'
        :phase==='approach'
          ?'Сближай героев и наращивай интригу, сохраняя возможность неожиданного, но логичного узнавания.'
          :'Можешь раскрыть художественное имя и роль героя по канону истории. Не раскрывай личные данные реального пользователя.'};
}
export function noirTrialPlan(plan=noirBeatPlan(1)){
  const available=!plan.finale&&[2,4].includes(Number(plan.beat));
  return {available,consent_required:true,
    allowed_intensity:['subtle','bold'],
    default_intensity:'subtle',
    decline_is_valid:true,
    real_world_actions_opt_in_only:true,
    directive:available
      ?'Предложи одно сюжетно оправданное чувственное испытание, не обязательное для прогресса. Дай альтернативу с меньшей интенсивностью и вариант отказаться, сохраняя последствия для атмосферы и отношений.'
      :'Не создавай пикантное задание в этой сцене без драматургической необходимости.'};
}
export function normalizeNoirTrial(raw,plan=noirBeatPlan(1)){
  if(!noirTrialPlan(plan).available||!raw||typeof raw!=='object')return null;
  const clean=(x,n)=>String(x||'').trim().slice(0,n);
  const title=clean(raw.title,120),invitation=clean(raw.invitation,330);
  if(!title||!invitation)return null;
  return {title,invitation,
    intensity:raw.intensity==='bold'?'bold':'subtle',
    opt_in:true,
    softer_option:clean(raw.softer_option,260)||'Выбрать более осторожный путь',
    decline_option:clean(raw.decline_option,260)||'Отказаться и продолжить историю',
    effect:clean(raw.effect,260),
    audio_cue:null
  };
}

export function cleanNoirAnalysis(raw={}){
  const src=raw&&typeof raw==='object'?raw:{};
  const clean=(v,max=200)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
  return {
    intent:clean(src.intent,160),
    emotional_shift:clean(src.emotional_shift,180),
    plot_consequence:clean(src.plot_consequence,300),
    thread_affected:clean(src.thread_affected,120),
    choice_effect:clean(src.choice_effect,200)
  };
}
export function attachNoirScene(scene={},plan=noirBeatPlan(1)){
  const source=scene&&typeof scene==='object'?scene:{};
  const partner=noirPartnerPlan(plan);
  const trial=normalizeNoirTrial(source.noir_trial,plan);
  const progress={
    episode:plan.episode,beat:plan.beat,
    beats_per_episode:plan.beats_per_episode,
    episode_count:plan.episode_count,narrative_stage:plan.narrative_stage,
    partner_reveal_phase:partner.phase,novel_sound_status:'deferred',
    finale:Boolean(plan.finale),novel_finished:Boolean(plan.novel_finished)
  };
  const prompt=plan.finale?'':String(source.primary_interaction?.prompt||'').trim();
  const options=plan.finale?[]:(Array.isArray(source.optional_actions)?source.optional_actions:[]).slice(0,3);
  // Trial choices are explicit opt-ins and stay available even if the
  // novelist did not include them among ordinary narrative actions.
  // The server validates action_key against these canonical options.
  const plotChoices=trial?[
    {key:'noir_trial_accept',label:'Принять приглашение'},
    {key:'noir_trial_soft',label:trial.softer_option},
    {key:'noir_trial_decline',label:trial.decline_option}
  ]:options;
  const blocks=String(source.prose||'').trim().split(/\n\s*\n+/).filter(Boolean);
  // SD still appears after text has established the location/characters.
  const visualAfter=Math.max(1,Math.ceil((blocks.length||1)*.75));
  return {...source,chapter_no:Math.max(Number(source.chapter_no)||1,plan.episode),
    primary_interaction:{type:plan.finale?'none':'free_reply',prompt},
    optional_actions:plotChoices,noir_trial:trial,noir_progress:progress,visual_after_paragraph:visualAfter};
}
