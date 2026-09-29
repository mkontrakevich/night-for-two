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


function padSerialNovelPlan(raw,{bookSeed=''}={}){
  const data=parse(raw);
  const protagonists=protagonistSource(data);
  if(protagonists.length<2)throw new Error('NIGHT_NOVEL_PROTAGONISTS_INVALID');

  const supporting=arr(data.supporting_characters,16);
  while(supporting.length<4){
    const i=supporting.length+1;
    supporting.push({
      id:`support_${i}`,
      name:`Персонаж ${i}`,
      sex:i%2?'male':'female',
      public_identity:'Второстепенный участник истории',
      private_motive:'Добиться собственной цели, влияющей на главную интригу',
      desire:'Изменить положение в истории',
      fear:'Потерять влияние на исход событий',
      contradiction:'Помогает героям, но скрывает личный интерес',
      secret:'Связан с одной из скрытых деталей основной интриги',
      leverage:'Имеет доступ к важной информации',
      relationship_to_protagonists:'Связан с центральной парой через основную интригу',
      arc_start:'Наблюдает со стороны',
      arc_turn:'Вмешивается в ключевой момент',
      arc_end:'Раскрывает мотив и меняет баланс сил',
      first_appearance:Math.min(4,i),
      planned_reveal:'Его скрытая роль становится частью развязки'
    });
  }

  const episodes=arr(data.episodes,16);
  while(episodes.length<10){
    const i=episodes.length+1;
    episodes.push({
      title:`Серия ${i}`,
      dramatic_function:i===10?'Финальная развязка центральной интриги':`Эскалация конфликта и развитие линии ${i}`,
      opening_state:i===1?'Герои входят в основную ситуацию':'Последствия предыдущего поворота меняют положение героев',
      main_thread:'main',
      side_threads:[i%2?'mystery':'secondary_1'],
      clue_ids:[`clue_${i}`],
      role_cards:[
        {character_id:String(protagonists[0]?.id||'hero_m'),performed_by:'male_player'},
        {character_id:String(protagonists[1]?.id||'hero_f'),performed_by:'female_player'}
      ],
      major_turn:i===10?'Центральная тайна получает окончательное объяснение':`Поворот ${i} меняет понимание героями происходящего`,
      erotic_function:'Рост доверия, напряжения и близости между главными героями',
      ending_hook:i===10?'Эмоциональное послесловие и новый образ пары':`Новая деталь заставляет пересмотреть события серии ${i}`
    });
  }

  const threads=arr(data.thread_graph,16);
  const ids=new Set(threads.map(x=>String(x?.thread_id||'')));
  const ensureThread=(thread)=>{
    if(ids.has(thread.thread_id))return;
    threads.push(thread);ids.add(thread.thread_id);
  };
  ensureThread({thread_id:'main',kind:'main',title:'Главная линия',promise:'Центральный конфликт пары и основной сюжет',trigger:'Событие, запускающее историю',current_question:'Что стоит за центральной тайной?',clues:['main_clue'],false_leads:[],escalation_beats:['main_turn'],reveal:'Истина связывает внешнюю интригу и отношения героев',payoff:'Герои делают окончательный выбор',links:['mystery'],eligible_for_spinoff:false,return_to_main:'Определяет финал'});
  ensureThread({thread_id:'mystery',kind:'mystery',title:'Тайна',promise:'Расследование скрытой причины событий',trigger:'Первая противоречивая деталь',current_question:'Кто и зачем скрывает правду?',clues:['mystery_clue_1','mystery_clue_2'],false_leads:['mystery_false_1'],escalation_beats:['mystery_turn'],reveal:'Скрытый мотив раскрывается',payoff:'Тайна влияет на финальное решение',links:['main'],eligible_for_spinoff:true,return_to_main:'Разгадка меняет основную линию'});
  ensureThread({thread_id:'secondary_1',kind:'secondary',title:'Вторичная линия 1',promise:'Личная цель второстепенного героя',trigger:'Побочный конфликт',current_question:'Чего на самом деле хочет союзник?',clues:['secondary_clue_1'],false_leads:[],escalation_beats:['secondary_turn_1'],reveal:'Истинный мотив союзника',payoff:'Он помогает или мешает финальному выбору',links:['main'],eligible_for_spinoff:true,return_to_main:'Возвращается через ключевую улику'});
  ensureThread({thread_id:'secondary_2',kind:'secondary',title:'Вторичная линия 2',promise:'Альтернативный взгляд на центральную интригу',trigger:'Появление второго источника информации',current_question:'Можно ли доверять этой версии?',clues:['secondary_clue_2'],false_leads:['secondary_false_2'],escalation_beats:['secondary_turn_2'],reveal:'Версия частично подтверждается',payoff:'Линия закрывает один из скрытых вопросов',links:['mystery'],eligible_for_spinoff:true,return_to_main:'Даёт недостающий элемент разгадки'});
  ensureThread({thread_id:'sensory',kind:'sensory',title:'Эмоциональная линия',promise:'Изменение близости и доверия пары',trigger:'Первый совместный риск',current_question:'Смогут ли герои довериться друг другу полностью?',clues:['gesture_1'],false_leads:[],escalation_beats:['trust_turn'],reveal:'Главный страх пары назван прямо',payoff:'Близость становится осознанным выбором',links:['main'],eligible_for_spinoff:false,return_to_main:'Эмоционально завершает финал'});

  const beats=arr(data.master_plot,16);
  while(beats.length<10){
    const i=beats.length+1;
    beats.push({
      key:`beat_${i}`,
      title:`Поворот ${i}`,
      function:i===10?'Финальная развязка':`Эскалация и смена понимания на этапе ${i}`,
      episode:Math.min(10,i),
      threads:['main',i%2?'mystery':'secondary_1'],
      setup_ids:[`setup_${Math.max(1,i-1)}`],
      payoff_ids:[`setup_${i}`]
    });
  }

  const plants=arr(data.plant_payoff_ledger,32);
  while(plants.length<10){
    const i=plants.length+1;
    plants.push({
      setup_id:`setup_${i}`,
      planted_in:Math.max(1,Math.min(9,i)),
      visible_detail:`Заметная деталь ${i}, которая сначала выглядит случайной`,
      hidden_meaning:`Деталь ${i} связана с центральной интригой и меняет трактовку событий`,
      possible_interpretations:['случайность','намеренный след'],
      payoff_episode:Math.max(2,Math.min(10,i+1)),
      payoff_type:i%3===0?'twist':(i%2?'mystery':'reveal')
    });
  }

  const padded={
    ...data,
    novel_id_seed:data.novel_id_seed||bookSeed,
    supporting_characters:supporting,
    master_plot:beats,
    episodes,
    thread_graph:threads,
    plant_payoff_ledger:plants
  };
  console.warn?.('NIGHT_NOVEL_STRUCTURE_PADDED',JSON.stringify({
    beats:beats.length,episodes:episodes.length,threads:threads.length,plants:plants.length,supporting:supporting.length
  }));
  return padded;
}

export async function generateSerialNovelPlan({bookSeed='',relationshipProfile={},mutualWishes=[],generate}={}){
  if(typeof generate!=='function')throw new Error('NIGHT_NOVEL_AI_UNAVAILABLE');

  const systemPrompt=`${SERIAL_NOVELIST_SYSTEM}

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
novel_id_seed,title,logline,controlling_idea,dramatic_question,genre_mix,erotic_promise,world_bible,protagonists,supporting_characters,master_plot,episodes,thread_graph,plant_payoff_ledger,finale_contract,sequel_hooks,style_bible.`;

  const userPayload={
    bookSeed:String(bookSeed||''),
    relationshipProfile,
    mutualWishes:arr(mutualWishes,16),
    role_contract:{male_roles:'male_player',female_roles:'female_player'}
  };

  let last=null,lastRaw=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const raw=await generate({
        contour:'wife',
        requestName:'night_serial_novel_architect',
        skipDatabaseContext:false,
        temperature:attempt===0?.82:.68,
        maxTokens:9000,
        messages:[
          {role:'system',content:systemPrompt},
          {role:'user',content:JSON.stringify(userPayload)}
        ]
      });
      lastRaw=raw;
      return validateSerialNovelPlan(raw,{bookSeed});
    }catch(error){
      last=error;
      console.warn?.('NIGHT_NOVEL_ARCHITECT_RETRY',JSON.stringify({attempt:attempt+1,error:String(error?.message||error).slice(0,220)}));
    }
  }

  let repairRaw=null;
  try{
    repairRaw=await generate({
      contour:'wife',
      requestName:'night_serial_novel_architect_repair',
      skipDatabaseContext:false,
      temperature:.42,
      maxTokens:10000,
      messages:[
        {role:'system',content:`${systemPrompt}

REPAIR MODE. Предыдущий план не прошёл структурную проверку. Верни ПОЛНЫЙ новый JSON, не патч.
Обязательные количественные требования для repair:
— ровно 2 protagonists;
— 4–8 supporting_characters;
— 10 master_plot beats;
— 10 episodes;
— минимум 5 thread_graph элементов, включая main и mystery;
— минимум 10 plant_payoff_ledger элементов;
— минимум 2 thread_graph линии с eligible_for_spinoff=true.
Ни один обязательный массив нельзя сокращать или заменять кратким описанием.`},
        {role:'user',content:JSON.stringify({...userPayload,previous_plan:lastRaw||null,repair_reason:String(last?.message||last||'validation_failed').slice(0,400)})}
      ]
    });
    return validateSerialNovelPlan(repairRaw,{bookSeed});
  }catch(error){
    last=error;
    console.warn?.('NIGHT_NOVEL_ARCHITECT_REPAIR_FAILED',JSON.stringify({error:String(error?.message||error).slice(0,220)}));
  }

  for(const candidate of [repairRaw,lastRaw]){
    if(!candidate)continue;
    try{
      const padded=padSerialNovelPlan(candidate,{bookSeed});
      return validateSerialNovelPlan(padded,{bookSeed});
    }catch(error){
      last=error;
      console.warn?.('NIGHT_NOVEL_ARCHITECT_PAD_FAILED',JSON.stringify({error:String(error?.message||error).slice(0,220)}));
    }
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
