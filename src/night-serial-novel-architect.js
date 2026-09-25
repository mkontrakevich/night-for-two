import {SERIAL_NOVELIST_SYSTEM,NOVEL_PLAN_SCHEMA_VERSION} from './night-serial-novelist-skill.js';

function clean(v='',n=600){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function parse(raw){if(raw&&typeof raw==='object')return raw;return JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));}
function arr(v,max=40){return Array.isArray(v)?v.slice(0,max):[];}
function objectValues(v,max=40){return v&&typeof v==='object'&&!Array.isArray(v)?Object.values(v).slice(0,max):[];}
function protagonistSource(data={}){
  const candidates=[
    data.protagonists,
    data.main_characters,
    data.mainCharacters,
    data.heroes,
    data.hero_pair,
    data.heroPair,
    data.leads,
    data.characters?.protagonists
  ];
  for(const value of candidates){
    const list=Array.isArray(value)?value:objectValues(value,8);
    if(list.length>=2)return list.slice(0,8);
  }
  const all=Array.isArray(data.characters)?data.characters:objectValues(data.characters,20);
  const marked=all.filter(x=>x?.role==='protagonist'||x?.main===true||x?.is_protagonist===true);
  return marked.length>=2?marked.slice(0,8):[];
}


function normalizeSex(input={},index=0){
  const raw=String(input.sex||input.gender||'').trim().toLowerCase();
  const performed=String(input.performed_by||'').trim().toLowerCase();
  const female=new Set(['female','f','woman','woman_player','girl','женщина','женский','ж','девушка']);
  const male=new Set(['male','m','man','man_player','boy','мужчина','мужской','м','парень']);
  if(female.has(raw)||performed==='female_player')return 'female';
  if(male.has(raw)||performed==='male_player')return 'male';
  return index===1?'female':'male';
}
function normalizeCharacter(input={},index=0){
  const sex=normalizeSex(input,index);
  return {
    id:clean(input.id||`character_${index+1}`,64),
    name:clean(input.name||input.display_name||`Персонаж ${index+1}`,90),
    sex,
    performed_by:sex==='male'?'male_player':'female_player',
    public_identity:clean(input.public_identity,240),
    private_motive:clean(input.private_motive,260),
    desire:clean(input.desire,220),
    fear:clean(input.fear,220),
    contradiction:clean(input.contradiction,220),
    secret:clean(input.secret,300),
    leverage:clean(input.leverage,220),
    relationship_to_protagonists:clean(input.relationship_to_protagonists,260),
    arc_start:clean(input.arc_start,260),
    arc_turn:clean(input.arc_turn,260),
    arc_end:clean(input.arc_end,260),
    first_appearance:Math.max(1,Number(input.first_appearance)||1),
    planned_reveal:clean(input.planned_reveal,300),
    unresolved_questions:arr(input.unresolved_questions,8).map(x=>clean(x,180)).filter(Boolean)
  };
}

function normalizeBeat(input={},index=0){
  return {
    key:clean(input.key||`beat_${index+1}`,64),
    title:clean(input.title||`Поворот ${index+1}`,100),
    function:clean(input.function,300),
    episode:Math.max(1,Number(input.episode)||1),
    threads:arr(input.threads,8).map(x=>clean(x,64)).filter(Boolean),
    setup_ids:arr(input.setup_ids,8).map(x=>clean(x,64)).filter(Boolean),
    payoff_ids:arr(input.payoff_ids,8).map(x=>clean(x,64)).filter(Boolean)
  };
}

function normalizeThread(input={},index=0){
  return {
    thread_id:clean(input.thread_id||`thread_${index+1}`,64),
    kind:['main','mystery','secondary','role','investigation','sensory','experimental','spinoff'].includes(String(input.kind))?String(input.kind):'secondary',
    title:clean(input.title||`Линия ${index+1}`,100),
    promise:clean(input.promise,260),
    trigger:clean(input.trigger,260),
    current_question:clean(input.current_question,260),
    clues:arr(input.clues,12).map(x=>clean(x,200)).filter(Boolean),
    false_leads:arr(input.false_leads,8).map(x=>clean(x,200)).filter(Boolean),
    escalation_beats:arr(input.escalation_beats,10).map(x=>clean(x,220)).filter(Boolean),
    reveal:clean(input.reveal,320),
    payoff:clean(input.payoff,320),
    links:arr(input.links,12).map(x=>clean(x,64)).filter(Boolean),
    eligible_for_spinoff:Boolean(input.eligible_for_spinoff),
    return_to_main:clean(input.return_to_main,260)
  };
}

function normalizeEpisode(input={},index=0){
  return {
    episode:index+1,
    title:clean(input.title||`Серия ${index+1}`,100),
    dramatic_function:clean(input.dramatic_function,320),
    opening_state:clean(input.opening_state,300),
    main_thread:clean(input.main_thread,64),
    side_threads:arr(input.side_threads,6).map(x=>clean(x,64)).filter(Boolean),
    clue_ids:arr(input.clue_ids,10).map(x=>clean(x,64)).filter(Boolean),
    role_cards:arr(input.role_cards,8).map(x=>({
      character_id:clean(x?.character_id,64),
      performed_by:['male_player','female_player'].includes(String(x?.performed_by))?String(x.performed_by):'male_player'
    })),
    major_turn:clean(input.major_turn,320),
    erotic_function:clean(input.erotic_function,280),
    ending_hook:clean(input.ending_hook,320)
  };
}

function normalizePlant(input={},index=0){
  return {
    setup_id:clean(input.setup_id||`setup_${index+1}`,64),
    planted_in:Math.max(1,Number(input.planted_in)||1),
    visible_detail:clean(input.visible_detail,220),
    hidden_meaning:clean(input.hidden_meaning,300),
    possible_interpretations:arr(input.possible_interpretations,6).map(x=>clean(x,180)).filter(Boolean),
    payoff_episode:Math.max(1,Number(input.payoff_episode)||1),
    payoff_type:['reveal','twist','emotional','erotic','mystery'].includes(String(input.payoff_type))?String(input.payoff_type):'reveal',
    status:'planned'
  };
}

export function validateSerialNovelPlan(raw,{bookSeed=''}={}){
  const data=parse(raw);
  const protagonistCandidates=protagonistSource(data).map(normalizeCharacter);
  const male=protagonistCandidates.find(x=>x.sex==='male'),female=protagonistCandidates.find(x=>x.sex==='female');
  if(!male||!female)throw new Error(protagonistCandidates.length<2?'NIGHT_NOVEL_PROTAGONISTS_INVALID':'NIGHT_NOVEL_ROLE_PAIR_INVALID');
  const protagonists=[male,female];

  const supporting=arr(data?.supporting_characters,16).map(normalizeCharacter);
  const beats=arr(data?.master_plot,16).map(normalizeBeat);
  const episodes=arr(data?.episodes,16).map(normalizeEpisode);
  const threads=arr(data?.thread_graph,16).map(normalizeThread);
  const plants=arr(data?.plant_payoff_ledger,32).map(normalizePlant);
  if(beats.length<8||episodes.length<6||threads.length<4)throw new Error('NIGHT_NOVEL_STRUCTURE_TOO_THIN');

  return {
    schema_version:NOVEL_PLAN_SCHEMA_VERSION,
    book_seed:String(bookSeed||data?.novel_id_seed||''),
    title:clean(data?.title,120),
    logline:clean(data?.logline,420),
    controlling_idea:clean(data?.controlling_idea,420),
    dramatic_question:clean(data?.dramatic_question,320),
    genre_mix:arr(data?.genre_mix,8).map(x=>clean(x,80)).filter(Boolean),
    erotic_promise:clean(data?.erotic_promise,420),
    world_bible:{
      time:clean(data?.world_bible?.time,140),
      place:clean(data?.world_bible?.place,180),
      social_environment:clean(data?.world_bible?.social_environment,260),
      recurring_locations:arr(data?.world_bible?.recurring_locations,12).map(x=>clean(x,160)).filter(Boolean),
      institutions:arr(data?.world_bible?.institutions,10).map(x=>clean(x,180)).filter(Boolean),
      rules:arr(data?.world_bible?.rules,10).map(x=>clean(x,180)).filter(Boolean),
      traditions:arr(data?.world_bible?.traditions,10).map(x=>clean(x,180)).filter(Boolean),
      secrets:arr(data?.world_bible?.secrets,12).map(x=>clean(x,220)).filter(Boolean),
      objects:arr(data?.world_bible?.objects,12).map(x=>clean(x,180)).filter(Boolean),
      motifs:arr(data?.world_bible?.motifs,10).map(x=>clean(x,140)).filter(Boolean),
      sensual_visual_language:clean(data?.world_bible?.sensual_visual_language,360)
    },
    protagonists:[male,female],
    supporting_characters:supporting,
    master_plot:beats,
    episodes,
    thread_graph:threads,
    plant_payoff_ledger:plants,
    finale_contract:{
      crisis:clean(data?.finale_contract?.crisis,320),
      climax:clean(data?.finale_contract?.climax,360),
      central_resolution:clean(data?.finale_contract?.central_resolution,360),
      final_image:clean(data?.finale_contract?.final_image,280),
      must_payoff:arr(data?.finale_contract?.must_payoff,12).map(x=>clean(x,64)).filter(Boolean)
    },
    sequel_hooks:arr(data?.sequel_hooks,10).map(x=>clean(x,240)).filter(Boolean),
    style_bible:{
      voice:clean(data?.style_bible?.voice,220),
      pacing:clean(data?.style_bible?.pacing,220),
      dialogue:clean(data?.style_bible?.dialogue,220),
      visual_language:clean(data?.style_bible?.visual_language,260),
      forbidden_patterns:arr(data?.style_bible?.forbidden_patterns,12).map(x=>clean(x,160)).filter(Boolean)
    }
  };
}

export async function generateSerialNovelPlan({bookSeed='',relationshipProfile={},mutualWishes=[],generate}={}){
  if(typeof generate!=='function')throw new Error('NIGHT_NOVEL_AI_UNAVAILABLE');
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const raw=await generate({
        contour:'wife',
        requestName:'night_serial_novel_architect',
        skipDatabaseContext:false,
        temperature:.9,
        maxTokens:6200,
        messages:[
          {role:'system',content:`${SERIAL_NOVELIST_SYSTEM}

Ты NOVEL ARCHITECT. Сейчас НЕ пиши первую сцену. Спроектируй весь скрытый роман, который движок будет раскрывать позже.

Требования:
— полностью оригинальная история;
— ровно два главных протагониста: один male, один female;
— ОБЯЗАТЕЛЬНО верни их именно в верхнеуровневом массиве protagonists, ровно 2 объекта;
— protagonists[0].sex="male", protagonists[0].performed_by="male_player";
— protagonists[1].sex="female", protagonists[1].performed_by="female_player";
— не переименовывай protagonists в heroes/main_characters/characters;
— все дополнительные male roles performed_by=male_player, все female roles performed_by=female_player;
— 8–12 серий;
— минимум 4 сюжетные линии: main, mystery/intrigue и минимум 2 secondary;
— минимум 4 supporting characters;
— минимум 8 master plot beats;
— минимум 8 plant/payoff элементов;
— у второстепенных героев должны быть собственные мотивы, секреты и линии, которые можно исследовать нативно;
— минимум две линии eligible_for_spinoff;
— центральный финал должен быть известен заранее;
— каждая серия имеет dramatic_function, major_turn, erotic_function и ending_hook;
— роман должен выдерживать возвращение игроков по дням;
— не копируй известные книги/фильмы/персонажей.

Верни только JSON со следующими верхнеуровневыми ключами:
novel_id_seed,title,logline,controlling_idea,dramatic_question,genre_mix,erotic_promise,world_bible,protagonists,supporting_characters,master_plot,episodes,thread_graph,plant_payoff_ledger,finale_contract,sequel_hooks,style_bible.`},
          {role:'user',content:JSON.stringify({
            bookSeed:String(bookSeed||''),
            relationshipProfile,
            mutualWishes:arr(mutualWishes,16),
            role_contract:{male_roles:'male_player',female_roles:'female_player'}
          })}
        ]
      });
      return validateSerialNovelPlan(raw,{bookSeed});
    }catch(error){last=error;}
  }
  throw last||new Error('NIGHT_NOVEL_PLAN_FAILED');
}

export function novelSceneContext(plan={},state={}){
  const episodeIndex=Math.max(0,Number(state.episode_index)||0);
  const episode=plan?.episodes?.[episodeIndex]||plan?.episodes?.[0]||{};
  const threadIds=new Set([episode.main_thread,...(episode.side_threads||[])].filter(Boolean));
  const threads=(plan?.thread_graph||[]).filter(x=>threadIds.has(x.thread_id));
  const pendingPlants=(plan?.plant_payoff_ledger||[]).filter(x=>x.status!=='paid'&&(x.planted_in===episodeIndex+1||x.payoff_episode===episodeIndex+1));
  return {
    novel_title:plan.title,
    logline:plan.logline,
    controlling_idea:plan.controlling_idea,
    dramatic_question:plan.dramatic_question,
    world_bible:plan.world_bible,
    protagonists:plan.protagonists,
    supporting_characters:plan.supporting_characters,
    episode,
    active_threads:threads,
    pending_plants:pendingPlants,
    finale_contract:plan.finale_contract,
    style_bible:plan.style_bible,
    current_roles:state.current_roles||{},
    canon:state.canon||{},
    character_knowledge:state.character_knowledge||{},
    unresolved_hooks:state.unresolved_hooks||[]
  };
}
