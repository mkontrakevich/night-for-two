import {STORY_DIRECTOR_SYSTEM} from './night-story-director.js';
import {ROOM17_STORY_BIBLE,room17Scene,room17RoleBriefs} from './night-demo-room17.js';
import {readerGenerationContract} from './night-reader-engine.js';

const clean=(v='',n=2400)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
const cleanProse=(v='',n=7000)=>String(v||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,n);
const parse=raw=>raw&&typeof raw==='object'?raw:JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));

export function validateRoom17Preview(raw,{sceneIndex=0}={}){
  const data=parse(raw),scene=room17Scene(sceneIndex),male=data?.roles?.male_player||{},female=data?.roles?.female_player||{};
  const out={
    scene_id:scene.id,
    title:clean(data?.title,120),
    literary_text:cleanProse(data?.literary_text,2600),
    interaction_summary:clean(data?.interaction_summary,700),
    roles:{
      male_player:{character:clean(male.character,80),goal:clean(male.goal,500),expected_action:clean(male.expected_action,700)},
      female_player:{character:clean(female.character,80),goal:clean(female.goal,500),expected_action:clean(female.expected_action,700)}
    },
    story_consequence:clean(data?.story_consequence,700),
    echo_line:clean(data?.echo_line||scene.echo_line,180),
    visual_prompt:clean(data?.visual_prompt,500),
    acceptance_required:true
  };
  if(!out.title||out.literary_text.length<180||!out.interaction_summary||!out.roles.male_player.character||!out.roles.female_player.character)throw new Error('ROOM17_PREVIEW_INVALID');
  return out;
}

export async function generateRoom17Preview({sceneIndex=0,gate={},canon={},history=[],coupleProfile={},generate}={}){
  if(typeof generate!=='function')throw new Error('ROOM17_AI_UNAVAILABLE');
  const scene=room17Scene(sceneIndex),roles=room17RoleBriefs(sceneIndex),effective=gate?.intensity?.effective;
  if(!effective)throw new Error('ROOM17_EFFECTIVE_INTENSITY_REQUIRED');
  const raw=await generate({
    contour:'wife',
    requestName:'night_room17_scene_preview',
    skipDatabaseContext:false,
    temperature:.82,
    maxTokens:1800,
    messages:[
      {role:'system',content:`${STORY_DIRECTOR_SYSTEM}

Ты пишешь одну сцену пилотной серии «Комната №17».
Оба игрока уже отдельно подтвердили готовность взаимодействовать; тебе передан только общий effective_intensity. Никогда не раскрывай индивидуальные ответы.

Правила:
— это литературный фрагмент романа, а не инструкция или анкета;
— сцена обязана продолжать scene.story_goal и накопленный canon;
— явно, но красиво дай понять каждому игроку, кого он играет и с каким персонажем взаимодействует;
— характер реплик, действий и вариантов должен следовать Character Passport;
— используй конкретные детали места, предметы, паузы, интонации, ожидание и callbacks;
— описание должно быть достаточно конкретным, чтобы каждый игрок понял предполагаемые реальные действия ДО принятия сцены;
— после принятия preview нельзя незаметно добавлять новые действия;
— отказ от preview допустим и ведёт к альтернативному сюжетному маршруту;
— загадка, улика или условие должны быть встроены в диалог и действия персонажей;
— high означает только более интенсивную версию внутри уже допустимых границ пары;
— не превращай сцену в отдельную мини-игру.

Верни только JSON:
{
  "title":"...",
  "literary_text":"...",
  "interaction_summary":"краткое ясное описание предполагаемого взаимодействия",
  "roles":{
    "male_player":{"character":"...","goal":"...","expected_action":"..."},
    "female_player":{"character":"...","goal":"...","expected_action":"..."}
  },
  "story_consequence":"что поставлено на карту",
  "echo_line":"...",
  "visual_prompt":"..."
}`},
      {role:'user',content:JSON.stringify({
        demo:ROOM17_STORY_BIBLE,
        scene,
        roles,
        effective_intensity:effective,
        canon,
        recent_history:Array.isArray(history)?history.slice(-8):[],
        couple_profile:coupleProfile
      })}
    ]
  });
  return validateRoom17Preview(raw,{sceneIndex});
}


export function validateRoom17ReaderSegment(raw,{sceneIndex=0,expectedPages=4}={}){
  const data=parse(raw),scene=room17Scene(sceneIndex),pages=Array.isArray(data?.pages)?data.pages:[];
  if(pages.length<2||pages.length>6)throw new Error('ROOM17_READER_SEGMENT_PAGE_COUNT_INVALID');
  const normalized=pages.map((p,i)=>({
    id:clean(p?.id||`${scene.id}_reader_${i+1}`,100),
    kind:'prose',
    title:clean(p?.title,160),
    text:cleanProse(p?.text,7000),
    scene_id:scene.id,
    interaction_anchor:i===pages.length-1?scene.id:null,
    media:p?.media&&typeof p.media==='object'?{
      kind:['image','video'].includes(String(p.media.kind))?String(p.media.kind):'image',
      prompt:clean(p.media.prompt,700),
      status:'planned'
    }:null
  }));
  if(normalized.some(p=>p.text.length<500))throw new Error('ROOM17_READER_SEGMENT_TOO_SHORT');
  const expected=Math.max(2,Math.min(6,Number(expectedPages)||4));
  return {scene_id:scene.id,expected_pages:expected,pages:normalized};
}

export async function generateRoom17ReaderSegment({sceneIndex=0,completedPages=0,remainingBeats=3,canon={},history=[],coupleProfile={},generate}={}){
  if(typeof generate!=='function')throw new Error('ROOM17_AI_UNAVAILABLE');
  const scene=room17Scene(sceneIndex),roles=room17RoleBriefs(sceneIndex),contract=readerGenerationContract({
    targetPages:ROOM17_STORY_BIBLE.reader_plan?.target_pages||14,
    completedPages,
    remainingBeats
  });
  const raw=await generate({
    contour:'wife',
    requestName:'night_room17_reader_segment',
    skipDatabaseContext:false,
    temperature:.84,
    maxTokens:4200,
    messages:[
      {role:'system',content:`${STORY_DIRECTOR_SYSTEM}

Ты пишешь очередной литературный сегмент одной пилотной серии «Комната №17» для полноэкранного reader.
Основной эпизод должен в сумме занять 10–20 экранных страниц текста. Пролог и эпилог считаются отдельно.
Сейчас создай ровно contract.next_segment_pages последовательных страниц, ведущих к следующей точке взаимодействия scene.id.

Требования к каждой странице:
— примерно 130–220 слов;
— это цельная художественная проза, а не карточки и не инструкция;
— следующая страница продолжает предыдущую без повторов и пересказа;
— диалоги, детали отеля, серебряный ключ, мотивы и знания персонажей должны оставаться каноничными;
— история должна естественно подвести к interaction_anchor, но не описывать физическую сцену до выбора обоими игроками готовности и уровня;
— задания, загадки и варианты будущих решений подготавливаются через реплики, предметы и события;
— последняя страница заканчивается на сильном сюжетном ожидании непосредственно перед interaction gate;
— media необязателен; если визуал действительно усиливает страницу, добавь media {kind:"image"|"video",prompt:"..."}. Не вставляй asset_url.

Верни только JSON:
{"pages":[{"id":"...","title":"...","text":"...","media":null}]}
`},
      {role:'user',content:JSON.stringify({
        demo:ROOM17_STORY_BIBLE,
        scene,
        roles,
        contract,
        canon,
        recent_history:Array.isArray(history)?history.slice(-10):[],
        couple_profile:coupleProfile
      })}
    ]
  });
  return validateRoom17ReaderSegment(raw,{sceneIndex,expectedPages:contract.next_segment_pages});
}
