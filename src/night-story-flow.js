import {STORY_DIRECTOR_SYSTEM,preferredInteractionKind,sanitizeDirectorMeta} from './night-story-director.js';
const MODE=Object.freeze({
  adaptive:{label:'История',maxLevel:3,maxPermission:'closer',baseTempo:'slow'},
  romance:{label:'Нежность',maxLevel:1,maxPermission:'touch',baseTempo:'slow'},
  sensual:{label:'Страсть',maxLevel:2,maxPermission:'closer',baseTempo:'active'},
  bold:{label:'Эксперимент',maxLevel:3,maxPermission:'closer',baseTempo:'active'},
  hardcore:{label:'Хардкор',maxLevel:3,maxPermission:'closer',baseTempo:'direct'}
});
const PERMISSIONS=Object.freeze(['words','embrace','kiss','touch','massage','closer']);
const LEVELS=Object.freeze(['familiar','open','bold','uninhibited']);
const TEMPO_RANK=Object.freeze({slow:0,active:1,direct:2});
export const STORY_MAX_CHOICE_STAGE=8;
export const STORY_PAGE_PLAN=Object.freeze([8,10,10,10,10,10,10,10,10,12]);
export const STORY_TOTAL_PAGES=STORY_PAGE_PLAN.reduce((sum,n)=>sum+n,0);
export const STORY_ARC=Object.freeze([
  {stage:0,key:'prologue',label:'ПРОЛОГ',purpose:'Сразу погрузить двух героев в уникальную ситуацию этой книги. Представить место, обстоятельства, притяжение и первую внутреннюю ставку истории. Финал ещё далеко, но читатель должен почувствовать, что всё уже началось.'},
  {stage:1,key:'attraction',label:'ПРИТЯЖЕНИЕ',purpose:'Развить первое напряжение и сократить дистанцию между героями через действие, детали места, взгляды, прикосновения и выбор темпа.'},
  {stage:2,key:'romance',label:'РОМАНТИКА',purpose:'Углубить эмоциональную связь. Дать героям причину доверять друг другу и сделать романтическую линию частью сюжета, а не отдельной вставкой.'},
  {stage:3,key:'trust',label:'ДОВЕРИЕ',purpose:'Проверить и укрепить доверие через игровое условие, небольшое задание, загадку или выбор, который раскрывает динамику пары и меняет следующий блок истории.'},
  {stage:4,key:'prelude',label:'ПРЕЛЮДИЯ',purpose:'Перевести историю из напряжения в конкретные совместные действия. Телесность растёт постепенно и только через совместимые выборы обоих.'},
  {stage:5,key:'discovery',label:'ОТКРЫТИЕ',purpose:'Добавить новое ощущение, роль, пространство или правило, которое логично вырастает из уже написанной истории и раскрывает героев с новой стороны.'},
  {stage:6,key:'deeper',label:'ГЛУБЖЕ',purpose:'Сделать близость более личной и насыщенной, сохраняя причинно-следственную связь, прежние детали и общий уровень допустимого.'},
  {stage:7,key:'passion',label:'СТРАСТЬ',purpose:'Ускорить и усилить историю. Сохранить романтическую ценность происходящего, но сделать действия и взаимное желание заметнее и конкретнее.'},
  {stage:8,key:'threshold',label:'ПЕРЕД КУЛЬМИНАЦИЕЙ',purpose:'Свести все предыдущие выборы в последнее совместное движение перед финалом. Никаких случайных новых сюжетных линий: только завершение уже накопленного напряжения.'},
  {stage:9,key:'finale',label:'КУЛЬМИНАЦИЯ',purpose:'Завершить одну и ту же историю в максимальной согласованной интенсивности, дать эмоциональную и сюжетную развязку и ощущение законченного романа.'}
]);
export function storyArcStage(stage=0){return STORY_ARC[Math.max(0,Math.min(STORY_ARC.length-1,Number(stage)||0))];}
export function storyPageCount(stage=0){return STORY_PAGE_PLAN[Math.max(0,Math.min(STORY_PAGE_PLAN.length-1,Number(stage)||0))]||10;}
export function storyPageOffset(stage=0){const s=Math.max(0,Math.min(STORY_PAGE_PLAN.length-1,Number(stage)||0));return STORY_PAGE_PLAN.slice(0,s).reduce((sum,n)=>sum+n,0);}


function clean(v='',n=500){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function cleanProse(v='',n=7000){return String(v||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,n);}
function parse(raw){if(raw&&typeof raw==='object')return raw;return JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));}
function modeConfig(mode='adaptive'){return MODE[mode]||MODE.adaptive;}
function permRank(key='words'){const i=PERMISSIONS.indexOf(String(key));return i<0?0:i;}
function levelRank(key='familiar'){const i=LEVELS.indexOf(String(key));return i<0?0:i;}
function clampPermission(permission,mode){const cfg=modeConfig(mode),i=Math.min(permRank(permission),permRank(cfg.maxPermission));return PERMISSIONS[i];}
function clampLevel(level,mode){const cfg=modeConfig(mode),i=Math.min(levelRank(level),Number(cfg.maxLevel));return LEVELS[i];}
function permissionsThrough(permission){return PERMISSIONS.slice(0,permRank(permission)+1);}
function slowerTempo(a='slow',b='slow'){return (TEMPO_RANK[a]??0)<=(TEMPO_RANK[b]??0)?a:b;}

export function initialStoryProfile(mode='adaptive'){
  const cfg=modeConfig(mode),permission=mode==='romance'?'kiss':'touch';
  return {mode,level:LEVELS[Math.min(cfg.maxLevel,mode==='hardcore'?2:mode==='bold'?1:0)],permission:clampPermission(permission,mode),tempo:cfg.baseTempo,leader:'mutual',novelty:'familiar'};
}

function option(key,intent,meta){return {key,intent,meta};}

export function storyBlueprint(mode='adaptive',stage=0,profile=initialStoryProfile(mode)){
  const cfg=modeConfig(mode),s=Math.max(0,Math.min(STORY_MAX_CHOICE_STAGE,Number(stage)||0));
  if(s===0&&mode==='adaptive')return [
    option('tender_path','Остаться в мягком притяжении: больше взгляда, близости и нежности, без спешки',{tempo:'slow',leader:'mutual',level:'familiar',permission:'kiss',novelty:'familiar'}),
    option('passion_path','Позволить взаимному желанию стать заметнее и быстрее сократить дистанцию',{tempo:'active',leader:'mutual',level:'open',permission:'touch',novelty:'familiar'}),
    option('experiment_path','Добавить в эту же историю неожиданный элемент — новую роль, ощущение или правило',{tempo:'active',leader:'alternating',level:'bold',permission:'massage',novelty:'sensory'}),
    option('intense_path','Не растягивать напряжение и двигаться к максимально интенсивной версии этой истории',{tempo:'direct',leader:'alternating',level:'uninhibited',permission:'closer',novelty:'role'})
  ];
  if(s===0)return [
    option('slow_draw','Остаться в медленном напряжении и позволить истории раскрыться постепенно',{tempo:'slow',leader:'mutual',level:'familiar',permission:'kiss'}),
    option('take_lead','Один из партнёров уверенно задаёт следующий шаг, второй принимает или мягко корректирует темп',{tempo:cfg.baseTempo,leader:'alternating',level:mode==='romance'?'familiar':'open',permission:mode==='romance'?'kiss':'touch'}),
    option('closer_now','Сократить дистанцию быстрее и сделать телесное притяжение главным двигателем сцены',{tempo:mode==='hardcore'?'direct':'active',leader:'mutual',level:mode==='romance'?'open':mode==='sensual'?'open':'bold',permission:mode==='romance'?'touch':'massage'})
  ];
  if(s===1)return [
    option('keep_familiar','Продолжить эту же сцену через близость и внимание, не повышая текущую интенсивность',{novelty:profile.novelty||'familiar',level:profile.level,permission:profile.permission,tempo:profile.tempo}),
    option('sensory_shift','Добавить один новый сенсорный штрих внутри этой же истории: свет, текстуру, температуру, музыку или пространство',{novelty:'sensory',level:clampLevel(LEVELS[Math.min(3,levelRank(profile.level)+1)],mode),permission:clampPermission(PERMISSIONS[Math.min(PERMISSIONS.length-1,permRank(profile.permission)+1)],mode),tempo:profile.tempo}),
    option('role_shift','Передать инициативу или изменить роль одного из героев, сохранив причинную связь с прологом',{novelty:'role',leader:'alternating',level:clampLevel(LEVELS[Math.min(3,levelRank(profile.level)+1)],mode),permission:clampPermission(PERMISSIONS[Math.min(PERMISSIONS.length-1,permRank(profile.permission)+1)],mode),tempo:profile.tempo})
  ];
  if(s===2)return [
    option('stay_here','Удержать текущую степень близости и сделать её глубже за счёт темпа, внимания и обратной связи',{level:profile.level,permission:profile.permission,tempo:profile.tempo,leader:profile.leader,novelty:profile.novelty}),
    option('one_step_deeper','Сделать один согласованный шаг глубже, продолжая ту же линию действий',{level:clampLevel(LEVELS[Math.min(3,levelRank(profile.level)+1)],mode),permission:clampPermission(PERMISSIONS[Math.min(PERMISSIONS.length-1,permRank(profile.permission)+1)],mode),tempo:profile.tempo,leader:profile.leader,novelty:profile.novelty}),
    option('switch_control','Сохранить допустимый уровень, но поменять того, кто ведёт, или несколько раз передать инициативу',{level:profile.level,permission:profile.permission,tempo:profile.tempo,leader:'alternating',novelty:profile.novelty})
  ];
  return [
    option('slow_peak','Подвести историю к кульминации постепенно, сохранив текущую общую границу',{level:profile.level,permission:profile.permission,tempo:'slow',leader:profile.leader,novelty:profile.novelty}),
    option('shared_peak','Сделать движение к кульминации взаимным и активным, не перескакивая текущую границу',{level:profile.level,permission:profile.permission,tempo:'active',leader:'mutual',novelty:profile.novelty}),
    option('intense_peak','Если предыдущие выборы обоих уже привели сюда — довести историю до максимально интенсивной общей границы',{level:clampLevel(LEVELS[Math.min(3,levelRank(profile.level)+1)],mode),permission:clampPermission(PERMISSIONS[Math.min(PERMISSIONS.length-1,permRank(profile.permission)+1)],mode),tempo:'direct',leader:profile.leader,novelty:profile.novelty})
  ];
}

export function optionFor(scene={},key=''){return (scene?.options||[]).find(o=>String(o.key)===String(key))||null;}

export function mergeDirectorSignals(a={},b={}){
  const aa=a?.director_meta||{},bb=b?.director_meta||{};
  const consent=aa.consent_signal==='soften'||bb.consent_signal==='soften'?'soften':(aa.consent_signal==='deepen'&&bb.consent_signal==='deepen'?'deepen':'hold');
  const intensity=Math.min(Number.isFinite(Number(aa.intensity_delta))?Number(aa.intensity_delta):0,Number.isFinite(Number(bb.intensity_delta))?Number(bb.intensity_delta):0);
  const unique=(...values)=>[...new Set(values.flat().map(v=>String(v||'').trim()).filter(Boolean))].slice(0,6);
  return {
    consent_signal:consent,
    intensity_delta:Math.max(-1,Math.min(1,intensity)),
    psychological_goals:unique(aa.psychological_goal,bb.psychological_goal),
    intimacy_goals:unique(aa.intimacy_goal,bb.intimacy_goal),
    narrative_goals:unique(aa.narrative_goal,bb.narrative_goal),
    language_strategies:unique(aa.language_strategy,bb.language_strategy)
  };
}


export function applyStoryOption(profile={},opt={},mode='sensual'){
  const meta=opt?.meta||{},base={...initialStoryProfile(mode),...profile};
  return {
    mode,
    level:clampLevel(meta.level||base.level,mode),
    permission:clampPermission(meta.permission||base.permission,mode),
    tempo:['slow','active','direct'].includes(meta.tempo)?meta.tempo:base.tempo,
    leader:['mutual','alternating','a','b'].includes(meta.leader)?meta.leader:base.leader,
    novelty:['familiar','sensory','role'].includes(meta.novelty)?meta.novelty:base.novelty
  };
}

export function mergeStoryProfiles(a={},b={},mode='sensual'){
  const aa={...initialStoryProfile(mode),...a},bb={...initialStoryProfile(mode),...b};
  const level=LEVELS[Math.min(levelRank(aa.level),levelRank(bb.level))];
  const permission=PERMISSIONS[Math.min(permRank(aa.permission),permRank(bb.permission))];
  return {
    mode,
    level:clampLevel(level,mode),
    permission:clampPermission(permission,mode),
    permissions:permissionsThrough(clampPermission(permission,mode)),
    tempo:slowerTempo(aa.tempo,bb.tempo),
    leader:aa.leader===bb.leader?aa.leader:'alternating',
    novelty:aa.novelty===bb.novelty?aa.novelty:'familiar'
  };
}

function normalizeReaderPage(p={},i=0,stage=0){
  const prompt=p?.media&&typeof p.media==='object'?clean(p.media.prompt,500):'';
  const media=prompt?{kind:'image',prompt,status:'planned'}:null;
  return {id:clean(p?.id||`stage_${stage}_page_${i+1}`,80),title:clean(p?.title,120),text:cleanProse(p?.text,7000),media};
}
function validateGeneratedScene(raw,{mode,stage,blueprint,final=false,preferredKind='choice'}){
  const data=parse(raw),title=clean(data?.title,90),text=clean(data?.text,1200),visualPrompt=clean(data?.visual_prompt,420),expectedPages=storyPageCount(stage),offset=storyPageOffset(stage);
  if(!title||!text||!visualPrompt)throw new Error('NIGHT_STORY_SCENE_INVALID');
  const generatedPages=Array.isArray(data?.reader_pages)?data.reader_pages:[];
  const readerPages=generatedPages.slice(0,expectedPages).map((p,i)=>normalizeReaderPage(p,i,stage));
  const mediaCount=readerPages.filter(p=>p.media?.prompt).length,minMedia=(Number(stage)===0||final)?2:1;
  if(readerPages.length!==expectedPages||readerPages.some(p=>p.text.length<450)||mediaCount<minMedia||mediaCount>2)throw new Error(final?'NIGHT_STORY_FINALE_PAGES_INVALID':'NIGHT_STORY_READER_PAGES_INVALID');
  const readerMeta={chapter_stage:Number(stage)||0,chapter_label:storyArcStage(stage).label,episode_page_offset:offset,episode_page_total:STORY_TOTAL_PAGES,chapter_page_total:expectedPages};
  if(final)return {version:4,mode,stage,final:true,title,text,visual_prompt:visualPrompt,reader_pages:readerPages,reader_meta:{...readerMeta,finale:true},question:'',interaction:null,options:[]};
  const interaction=data?.interaction&&typeof data.interaction==='object'?data.interaction:{kind:'choice',prompt:data?.question||'',options:data?.options||[]};
  const kind=['choice','task','riddle'].includes(String(interaction.kind))?String(interaction.kind):preferredKind;
  const prompt=clean(interaction.prompt||data?.question||'',180);
  const generated=Array.isArray(interaction.options)?interaction.options:Array.isArray(data?.options)?data.options:[];
  const byKey=new Map(generated.map(x=>[String(x?.key||''),x]));
  const options=blueprint.map(x=>{
    const generatedOption=byKey.get(x.key)||{};
    return {key:x.key,label:clean(generatedOption.label,140),intent:x.intent,meta:x.meta,director_meta:sanitizeDirectorMeta(generatedOption)};
  });
  if(!prompt||options.some(x=>!x.label))throw new Error('NIGHT_STORY_OPTIONS_INVALID');
  return {version:4,mode,stage,final:false,title,text,visual_prompt:visualPrompt,reader_pages:readerPages,reader_meta:readerMeta,question:prompt,interaction:{kind,prompt},options};
}

export async function generateStoryScene({mode='adaptive',stage=0,profile=initialStoryProfile(mode),history=[],relationshipProfile={},mutualWishes=[],bookSeed='',generate,final=false}={}){
  if(typeof generate!=='function')throw new Error('NIGHT_STORY_AI_UNAVAILABLE');
  const cfg=modeConfig(mode),arc=storyArcStage(stage),pageCount=storyPageCount(stage),pageOffset=storyPageOffset(stage),blueprint=final?[]:storyBlueprint(mode,stage,profile),preferredKind=preferredInteractionKind(stage,bookSeed);
  let last=null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const raw=await generate({
        contour:'wife',
        requestName:final?'night_story_finale':'night_story_scene',
        skipDatabaseContext:false,
        temperature:.86,
        maxTokens:6500,
        messages:[
          {role:'system',content:`${STORY_DIRECTOR_SYSTEM}

КОНТЕКСТ GAMEBOOK
Отдельного селектора темы или уровня у пользователя НЕТ. Интенсивность рождается из развилок самой истории и объединённых выборов обоих героев.
Ты пишешь интерактивную книгу-игру с фиксированной драматургической дугой: ПРОЛОГ → РОМАНТИКА → ПРЕЛЮДИЯ → СТРАСТЬ → КУЛЬМИНАЦИЯ.
Каждый экран — следующая глава ОДНОЙ цельной истории этих двух героев. Сохраняй место, детали, причинно-следственную связь и действия из previous. Текущая глава обязана выполнять arc.purpose.
bookSeed уникален для каждой новой игровой сессии: это НОВАЯ книга. Не повторяй сюжет, сеттинг, центральную интригу, формулировки пролога или финальный образ из предыдущих сессий, даже если ответы совпадают.
Помимо краткого text, обязательно верни reader_pages для полноэкранного постраничного чтения.\nЭта книга состоит ровно из 100 экранных страниц, распределённых по десяти последовательным главам. Для текущей главы верни РОВНО pageCount страниц. Каждая страница — примерно 120–190 слов литературного текста.\npageOffset показывает номер первой страницы текущей главы в общей книге; totalBookPages всегда равен 100.\nКаждая следующая страница продолжает предыдущую без повтора, сохраняет место, одежду, предметы, эмоциональное состояние и последствия действий. Последняя страница главы должна естественно привести к interaction.\nЕсли final=true, это финальная глава книги: всё равно верни ровно pageCount страниц; на последней странице дай полноценную эмоциональную и сюжетную развязку. interaction и options в финале не нужны.\nreader_pages — массив объектов {id,title,text,media?}. НЕ иллюстрируй каждую страницу. В каждой обычной главе выбери только 1–2 визуально значимые страницы; в ПРОЛОГЕ и ФИНАЛЕ — ровно 2. media добавляй только на таких страницах в виде {kind:"image",prompt:"..."}. Выбирай страницы с важным сюжетным действием, сильным описанием пространства, поворотом, выразительным сближением героев, сменой локации/образа, кульминацией или финальным образом. Переходные, поясняющие и обычные диалоговые страницы оставляй без media. prompt обязан продолжать визуальную линию предыдущих иллюстраций: те же взрослые герои, та же локация/гардероб, если сюжет их не менял. Никакой явной наготы или сексуального акта; только романтизированная кинематографичная телесность, одежда, силуэты, прикосновения, отражения, свет и атмосфера.\nКраткий text — лишь служебное резюме сегмента в 2–4 предложениях.
Не проси игроков придумывать сюжет — сюжет создаёшь ты.
Не раскрывай скрытые данные, переписку или то, кто какой вариант выбрал.
Учитывай relationshipProfile и mutualWishes только как мягкий контекст. Никогда не выходи за effectiveProfile.
preferredInteractionKind=${preferredKind}. Для этой главы используй именно этот тип interaction, если это не ломает сюжет.
Для обычной сцены каждый blueprint intent преврати в естественный вариант продолжения; ключи options менять нельзя.
visual_prompt — краткое описание вертикального кинематографичного кадра без лиц, текста, явной наготы и сексуального акта.
Если один из двух героев выбирает мягче, общий путь остаётся мягче.
Верни только JSON.`},
          {role:'user',content:JSON.stringify({
            mode,label:cfg.label,stage,arc,pageCount,pageOffset,totalBookPages:STORY_TOTAL_PAGES,final,bookSeed:String(bookSeed||''),effectiveProfile:profile,
            relationshipProfile,
            mutualWishes:(mutualWishes||[]).slice(0,12),
            previous:(history||[]).slice(-8).map(x=>({stage:x.stage,title:x.title,text:x.text,reader_tail:x.reader_tail||'',merged_choice:x.merged_choice,interaction_kind:x.interaction_kind||'',director_signal:x.director_signal||{}})),
            preferredInteractionKind:preferredKind,blueprint:blueprint.map(x=>({key:x.key,intent:x.intent}))
          })}
        ]
      });
      return validateGeneratedScene(raw,{mode,stage,blueprint,final,preferredKind});
    }catch(error){last=error;}
  }
  throw last||new Error('NIGHT_STORY_GENERATION_FAILED');
}

export async function simulateStoryChoice({scene={},relationshipProfile={},generate}={}){
  const keys=(scene?.options||[]).map(x=>x.key);
  if(!keys.length)return '';
  if(typeof generate==='function'){
    try{
      const raw=await generate({
        contour:'wife',requestName:'night_story_partner_choice',skipDatabaseContext:false,temperature:.55,maxTokens:120,
        messages:[
          {role:'system',content:'Ты моделируешь выбор второго совершеннолетнего партнёра для теста интерактивной истории. Выбери ровно один key только из allowed_keys, который вероятнее подойдёт профилю пары. Не объясняй. Верни JSON {"key":"..."}.'},
          {role:'user',content:JSON.stringify({scene:{title:scene.title,text:scene.text,question:scene.question,options:(scene.options||[]).map(o=>({key:o.key,label:o.label}))},allowed_keys:keys,relationshipProfile})}
        ]
      });
      const data=parse(raw);if(keys.includes(String(data?.key)))return String(data.key);
    }catch{}
  }
  return keys[0];
}

export function storyProfileToSelection(profile={},mode='sensual'){
  const p={...initialStoryProfile(mode),...profile};
  const categories={romance:['caress','desire'],sensual:['caress','sex','desire'],bold:['experiment','play','fantasy'],hardcore:['sex','experiment','fantasy']}[mode]||['caress','sex','desire'];
  return {version:3,categories,tempo:p.tempo,level:p.level,permissions:permissionsThrough(p.permission),boundaries:[]};
}
