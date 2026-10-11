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
  const progress={
    episode:plan.episode,beat:plan.beat,
    beats_per_episode:plan.beats_per_episode,
    episode_count:plan.episode_count,narrative_stage:plan.narrative_stage,
    finale:Boolean(plan.finale),novel_finished:Boolean(plan.novel_finished)
  };
  const prompt=plan.finale?'':String(source.primary_interaction?.prompt||'').trim();
  const options=plan.finale?[]:(Array.isArray(source.optional_actions)?source.optional_actions:[]).slice(0,3);
  const blocks=String(source.prose||'').trim().split(/\n\s*\n+/).filter(Boolean);
  // SD still appears after text has established the location/characters.
  const visualAfter=Math.max(1,Math.ceil((blocks.length||1)*.75));
  return {...source,chapter_no:Math.max(Number(source.chapter_no)||1,plan.episode),
    primary_interaction:{type:plan.finale?'none':'free_reply',prompt},
    optional_actions:options,noir_progress:progress,visual_after_paragraph:visualAfter};
}
