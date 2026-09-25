const MODES=Object.freeze({
  romance:{
    label:'Нежность',
    categories:['caress','desire','play'],
    brief:'Мягкая приватная история о возвращении внимания друг к другу: красивое начало, медленное сближение, телесная нежность и ощущение, что вечер принадлежит только им.',
    permissionFloor:['words','embrace','kiss','touch','massage']
  },
  sensual:{
    label:'Страсть',
    categories:['caress','sex','desire'],
    brief:'История взаимного желания: напряжение уже есть, партнёры не играют в случайное знакомство, а постепенно усиливают телесность, инициативу и сексуальную энергию вечера.',
    permissionFloor:['words','embrace','kiss','touch','massage','closer']
  },
  bold:{
    label:'Эксперимент',
    categories:['experiment','play','fantasy'],
    brief:'История нового опыта для знакомой пары: один неожиданный поворот — роль, образ, сенсорная деталь, новая обстановка или непривычная динамика — превращает вечер в небольшой приватный сюжет.',
    permissionFloor:['words','embrace','kiss','touch','massage','closer']
  },
  hardcore:{
    label:'Хардкор',
    categories:['sex','experiment','fantasy'],
    brief:'Высокоинтенсивная приватная история для пары, которая осознанно выбрала самый сильный режим: уверенная динамика, ясное лидерство, минимум раскачки и только то, что обоими явно разрешено.',
    permissionFloor:['words','embrace','kiss','touch','massage','closer']
  }
});

export function storyModeConfig(mode='sensual'){return MODES[mode]||MODES.sensual;}
export function storyModeCategories(mode='sensual'){return [...storyModeConfig(mode).categories];}
export function storyModePermissions(mode='sensual'){return [...storyModeConfig(mode).permissionFloor];}

function clean(v='',n=180){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function parse(raw){if(raw&&typeof raw==='object')return raw;return JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));}
function fallbackQuestions(mode){
  const common={
    romance:[
      ['setting','С чего начинается эта история?',[['quiet_room','Тихая комната и приглушённый свет'],['after_date','Возвращение после красивого выхода вдвоём'],['slow_music','Музыка, напиток и ощущение, что спешить некуда']]],
      ['lead','Кто первым меняет обычный ритм вечера?',[['me','Я'],['partner','Партнёр'],['mutual','Оба почти одновременно']]],
      ['focus','Что должно чувствоваться сильнее всего?',[['tenderness','Нежность и внимание'],['anticipation','Предвкушение'],['closeness','Максимальная телесная близость']]]
    ],
    sensual:[
      ['setting','Где сильнее всего чувствуется взаимное желание?',[['bedroom','В спальне, без отвлекающих деталей'],['living_room','В обычной комнате, которая постепенно меняет настроение'],['shower','В ванной или душе, где важнее ощущения']]],
      ['lead','Какая динамика заводит сегодня больше?',[['me','Я беру инициативу'],['partner','Партнёр ведёт'],['switch','Инициатива переходит от одного к другому']]],
      ['pace','Как должна развиваться история?',[['slow_heat','Медленно наращивать напряжение'],['direct','Довольно быстро перейти к близости'],['waves','Чередовать напор и паузы']]]
    ],
    bold:[
      ['twist','Какой элемент делает вечер необычным?',[['role','Новая роль или образ'],['sensory','Новые ощущения и сенсорный контраст'],['location','Непривычная приватная обстановка']]],
      ['lead','Как строится игра инициативы?',[['me','Сегодня веду я'],['partner','Сегодня ведёт партнёр'],['switch','Роли меняются по ходу истории']]],
      ['surprise','Что важнее в эксперименте?',[['unknown','Элемент неожиданности'],['visual','Визуальный образ и атмосфера'],['new_move','Новая телесная динамика']]]
    ],
    hardcore:[
      ['dynamic','Какая интенсивная динамика ближе сегодня?',[['firm_lead','Один уверенно ведёт'],['switch_control','Контроль переходит между партнёрами'],['mutual_intense','Оба действуют активно и на равных']]],
      ['pace','Какой ритм нужен истории?',[['fast','Быстро и без долгого вступления'],['build','Короткий разгон и затем высокая интенсивность'],['waves','Интенсивные отрезки с короткими паузами']]],
      ['edge','Что делает этот режим отличимым от «Эксперимента»?',[['control','Сильнее ощущается контроль и лидерство'],['intensity','Важнее максимальный накал'],['novelty','Нужен более смелый новый элемент']]]
    ]
  };
  return common[mode]||common.sensual;
}

export function fallbackStoryInterview(mode='sensual'){
  const cfg=storyModeConfig(mode),questions=fallbackQuestions(mode).map(([id,title,opts])=>({id,title,options:opts.map(([key,label])=>({key,label}))}));
  return {version:1,mode,label:cfg.label,title:'История на сегодня',premise:cfg.brief,questions};
}

export function validateStoryInterview(raw,mode='sensual'){
  const data=parse(raw),cfg=storyModeConfig(mode),qs=Array.isArray(data?.questions)?data.questions:[];
  if(qs.length<3)throw new Error('NIGHT_STORY_INTERVIEW_INVALID');
  const questions=qs.slice(0,3).map((q,index)=>{
    const id=clean(q?.id||'q'+(index+1),32).replace(/[^a-z0-9_\-]/gi,'_');
    const title=clean(q?.title,120),options=(Array.isArray(q?.options)?q.options:[]).slice(0,4).map((o,i)=>({key:clean(o?.key||('o'+(i+1)),32).replace(/[^a-z0-9_\-]/gi,'_'),label:clean(o?.label,90)})).filter(o=>o.key&&o.label);
    if(!title||options.length<2)throw new Error('NIGHT_STORY_INTERVIEW_INVALID');
    return {id,title,options};
  });
  const premise=clean(data?.premise||cfg.brief,360),title=clean(data?.title||'История на сегодня',80);
  return {version:1,mode,label:cfg.label,title,premise,questions};
}

export async function generateStoryInterview({mode='sensual',relationshipProfile={},safeSpace={},generate}={}){
  const cfg=storyModeConfig(mode);
  if(typeof generate!=='function')return fallbackStoryInterview(mode);
  try{
    const raw=await generate({
      contour:'wife',
      requestName:'night_story_interview',
      skipDatabaseContext:false,
      temperature:.72,
      maxTokens:800,
      messages:[
        {role:'system',content:'Ты создаёшь короткое приватное AI-интервью для двух совершеннолетних партнёров перед эротическим сценарием. У тебя уже есть выбранный уровень вечера И уже рассчитано общее безопасное пространство обоих партнёров в safeSpace. Придумай ОДНУ цельную историю-предпосылку этого уровня, но не раскрывай финал. Затем дай ровно 3 вопроса-селектора, которые помогают визуализировать эту же историю и не выходят за safeSpace: пространство/атмосфера, динамика инициативы, характер развития или уникальная деталь. Каждый вопрос имеет 3–4 коротких конкретных ответа. Не спрашивай «чего вы хотите вообще», не проси придумывать сценарий самим, не дублируй вопросы согласия и запретов. Вопросы должны отличаться между уровнями. Не включай опасные действия и публичные сексуальные действия. Верни только JSON {"title":"...","premise":"...","questions":[{"id":"...","title":"...","options":[{"key":"...","label":"..."}]}]}.'},
        {role:'user',content:JSON.stringify({mode,label:cfg.label,storyBrief:cfg.brief,safeSpace:{ceiling:safeSpace.ceiling,permissions:safeSpace.permissions||[],sharedCategories:safeSpace.sharedCategories||[],candidatePractices:[...new Set((safeSpace.candidates||[]).map(x=>x.practice))].slice(0,16)},relationshipProfile})}
      ]
    });
    return validateStoryInterview(raw,mode);
  }catch{return fallbackStoryInterview(mode);}
}

export function normalizeStoryAnswers(input={},interview={}){
  const out={},questions=Array.isArray(interview?.questions)?interview.questions:[];
  for(const q of questions){
    const value=clean(input?.[q.id],32),allowed=new Set((q.options||[]).map(o=>String(o.key)));
    if(allowed.has(value))out[q.id]=value;
  }
  return out;
}

export async function simulateStoryAnswers({interview={},relationshipProfile={},generate}={}){
  const questions=Array.isArray(interview?.questions)?interview.questions:[];
  if(!questions.length)return {};
  if(typeof generate==='function'){
    try{
      const raw=await generate({
        contour:'wife',
        requestName:'night_story_interview_partner',
        skipDatabaseContext:false,
        temperature:.55,
        maxTokens:260,
        messages:[
          {role:'system',content:'Смоделируй приватные ответы второго совершеннолетнего партнёра на селекторы истории. Для каждого question id выбери только один существующий key. Не объясняй выбор. Верни только JSON {"answers":{"question_id":"option_key"}}.'},
          {role:'user',content:JSON.stringify({interview,relationshipProfile})}
        ]
      });
      const data=parse(raw);return normalizeStoryAnswers(data?.answers||{},interview);
    }catch{}
  }
  return Object.fromEntries(questions.map((q,i)=>[q.id,q.options?.[i%Math.max(1,q.options?.length||1)]?.key||q.options?.[0]?.key]).filter(([,v])=>v));
}
