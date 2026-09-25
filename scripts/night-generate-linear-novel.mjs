import crypto from 'node:crypto';
import pg from 'pg';
import {completeAIText} from '../src/ai/provider-router.js';
import {generateSerialNovelPlan} from '../src/night-serial-novel-architect.js';
import {createNightLinearNovelStore} from '../src/night-linear-novel-store.js';
import {createNightVisualAI} from '../src/night-for-two-visual-ai.js';
import {STORY_ARC,STORY_PAGE_PLAN,STORY_TOTAL_PAGES,storyPageOffset} from '../src/night-story-flow.js';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
if(!process.env.OPENROUTER_API_KEY)throw new Error('OPENROUTER_API_KEY_MISSING');

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const store=createNightLinearNovelStore({pool});
const visualAI=createNightVisualAI();

function clean(v='',n=12000){return String(v||'').replace(/\r/g,'').trim().slice(0,n);}
function parseJson(raw){
  if(raw&&typeof raw==='object')return raw;
  const text=String(raw||'').trim().replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/g,'');
  try{return JSON.parse(text)}catch{
    const a=text.indexOf('{'),b=text.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(text.slice(a,b+1));
    throw new Error('NIGHT_LINEAR_NOVEL_JSON_INVALID');
  }
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function planDigest(plan={}){
  return {
    title:plan.title,logline:plan.logline,controlling_idea:plan.controlling_idea,dramatic_question:plan.dramatic_question,
    erotic_promise:plan.erotic_promise,genre_mix:plan.genre_mix,world_bible:plan.world_bible,
    protagonists:plan.protagonists,supporting_characters:plan.supporting_characters,
    master_plot:plan.master_plot,episodes:plan.episodes,thread_graph:plan.thread_graph,
    plant_payoff_ledger:plan.plant_payoff_ledger,finale_contract:plan.finale_contract,style_bible:plan.style_bible
  };
}
function validateChapter(raw,{chapterIndex,pageCount,startPage,final=false}){
  const data=parseJson(raw),chapterTitle=clean(data?.chapter_title,180),summary=clean(data?.summary,1600);
  const pages=Array.isArray(data?.pages)?data.pages:[];
  if(!chapterTitle||!summary||pages.length!==pageCount)throw new Error(`NIGHT_LINEAR_CHAPTER_INVALID:${chapterIndex+1}`);
  const normalized=pages.map((p,i)=>{
    const body=clean(p?.text,9000),pageTitle=clean(p?.title,180),requested=Boolean(p?.illustrate),mediaPrompt=requested?clean(p?.media_prompt,1200):'';
    if(body.length<500)throw new Error(`NIGHT_LINEAR_PAGE_INVALID:${startPage+i}`);
    if(requested&&!mediaPrompt)throw new Error(`NIGHT_LINEAR_MEDIA_PROMPT_INVALID:${startPage+i}`);
    return {page_no:startPage+i,chapter_no:chapterIndex+1,chapter_title:chapterTitle,page_title:pageTitle,body,media_prompt:mediaPrompt,illustrate:Boolean(mediaPrompt)};
  });
  const illustrated=normalized.filter(p=>p.illustrate).length,minIllustrations=(chapterIndex===0||final)?2:1;
  if(illustrated<minIllustrations||illustrated>2)throw new Error(`NIGHT_LINEAR_ILLUSTRATION_DENSITY_INVALID:${chapterIndex+1}:${illustrated}`);
  if(final&&!/конец|утро|тишин|рассвет|финал|после/i.test(normalized.at(-1)?.body||'')){
    console.warn('NIGHT_LINEAR_FINALE_SOFT_CHECK',JSON.stringify({chapter:chapterIndex+1}));
  }
  return {chapter_title:chapterTitle,summary,pages:normalized};
}

async function generateChapter({plan,chapterIndex,previousSummary='',previousTail='',bookSeed=''}) {
  const pageCount=STORY_PAGE_PLAN[chapterIndex],arc=STORY_ARC[chapterIndex],startPage=storyPageOffset(chapterIndex)+1,final=chapterIndex===STORY_ARC.length-1;
  let last=null;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const raw=await completeAIText({
        contour:'wife',
        requestName:'night_linear_novel_chapter',
        skipDatabaseContext:true,
        temperature:.82,
        maxTokens:7000,
        messages:[
          {role:'system',content:`Ты пишешь полностью оригинальный литературный сериал для двух вымышленных совершеннолетних героев — мужчины и женщины. Это законченный роман для приватного мобильного чтения, а не анкета и не инструкция игрокам.

Жанр: взрослый романтический/эротический триллер или драма с интригой. Все персонажи, участвующие в интимных сценах, однозначно совершеннолетние. Любая близость добровольна. Текст может быть чувственным и эротическим, но должен оставаться литературным: эмоции, напряжение, прикосновения, поцелуи, телесность, желание и последствия важнее анатомической детализации.

Ты пишешь ОДНУ заранее спроектированную историю. Не начинай новый сюжет в каждой главе. Сохраняй имена, внешность, пространство, предметы, мотивы, тайны, причинно-следственные связи, одежду и последствия предыдущих событий. Все plant/payoff и финальный контракт из NOVEL_PLAN обязательны.

Текущая драматургическая функция: ${arc.label} — ${arc.purpose}.
Текущая глава: ${chapterIndex+1} из ${STORY_ARC.length}.
Страницы книги: ${startPage}–${startPage+pageCount-1} из ${STORY_TOTAL_PAGES}.
Верни РОВНО ${pageCount} страниц по примерно 120–190 русских слов каждая. Это экранные страницы Mini App, каждая должна иметь самостоятельный ритм, но продолжать предыдущую.
Если это финальная глава, на последней странице полностью закрой центральную драматическую линию и дай эмоциональную развязку.

Иллюстрации НЕ нужны на каждой странице. Выбери только 1–2 визуально значимые страницы текущей главы; в ПРОЛОГЕ и ФИНАЛЬНОЙ главе — ровно 2.
Ставь illustrate=true только если страница содержит действительно значимый кадр: первое сильное описание места, важное сюжетное действие, поворот/разоблачение, выразительное сближение героев, заметную смену пространства/образа, кульминационный момент или финальный образ. Переходные, диалоговые и поясняющие страницы оставляй без изображения.
Для illustrate=true создай media_prompt для фотографической вертикальной 9:16 иллюстрации, точно соответствующей этой странице и продолжающей предыдущие кадры: те же вымышленные взрослые герои, внешность, гардероб и локация, пока сюжет их не меняет. Иллюстрация чувственная, романтизированная и кинематографичная, но без гениталий, сосков или изображения сексуального акта. Никакого текста на изображении.
Для illustrate=false media_prompt должен быть пустой строкой.

Не добавляй варианты выбора, вопросы читателю, задания или меню — все решения уже приняты за героев автором.
Верни ТОЛЬКО JSON:
{"chapter_title":"","summary":"","pages":[{"title":"","text":"","illustrate":false,"media_prompt":""}]}`},
          {role:'user',content:JSON.stringify({
            BOOK_SEED:bookSeed,
            NOVEL_PLAN:planDigest(plan),
            PREVIOUS_CHAPTER_SUMMARY:previousSummary,
            PREVIOUS_TAIL:previousTail,
            CHAPTER:{index:chapterIndex+1,label:arc.label,purpose:arc.purpose,page_count:pageCount,start_page:startPage,final}
          })}
        ]
      });
      return validateChapter(raw,{chapterIndex,pageCount,startPage,final});
    }catch(error){
      last=error;
      console.warn('NIGHT_LINEAR_CHAPTER_RETRY',JSON.stringify({chapter:chapterIndex+1,attempt,error:String(error?.message||error).slice(0,220)}));
      await sleep(1200*attempt);
    }
  }
  throw last||new Error(`NIGHT_LINEAR_CHAPTER_FAILED:${chapterIndex+1}`);
}

async function ensureImage({novelId,page}){
  const key=page.visual_key||`linear-novel-${novelId}-page-${String(page.page_no).padStart(3,'0')}`;
  let last=null;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const result=await visualAI.ensure({key,theme:'boudoir',mode:page.page_no===STORY_TOTAL_PAGES?'story_final':'story_scene',variant:`BOOK_PAGE: ${page.media_prompt}`});
      if(!result?.buffer?.length)throw new Error('NIGHT_LINEAR_IMAGE_EMPTY');
      return {key,model:result.model||'',cached:Boolean(result.cached)};
    }catch(error){
      last=error;
      console.warn('NIGHT_LINEAR_IMAGE_RETRY',JSON.stringify({page:page.page_no,attempt,error:String(error?.message||error).slice(0,220)}));
      await sleep(1800*attempt);
    }
  }
  throw last||new Error(`NIGHT_LINEAR_IMAGE_FAILED:${page.page_no}`);
}

let novel=null;
try{
  await store.init();
  const bookSeed=crypto.randomBytes(18).toString('hex');
  console.log('NIGHT_LINEAR_NOVEL_START',JSON.stringify({book_seed:bookSeed,total_pages:STORY_TOTAL_PAGES}));

  const plan=await generateSerialNovelPlan({
    bookSeed,
    relationshipProfile:{},
    mutualWishes:[],
    generate:request=>completeAIText({...request,skipDatabaseContext:true})
  });

  novel=await store.create({bookSeed,title:plan.title||'Ночь на двоих',plan,totalPages:STORY_TOTAL_PAGES});
  console.log('NIGHT_LINEAR_PLAN_READY',JSON.stringify({novel_id:novel.id,title:plan.title,episodes:plan.episodes?.length||0}));

  let pageCounter=0,plannedImages=0,previousSummary='',previousTail='';
  for(let chapterIndex=0;chapterIndex<STORY_ARC.length;chapterIndex++){
    const chapter=await generateChapter({plan,chapterIndex,previousSummary,previousTail,bookSeed});
    for(const rawPage of chapter.pages){
      const visualKey=rawPage.media_prompt?`linear-novel-${novel.id}-page-${String(rawPage.page_no).padStart(3,'0')}`:'';
      await store.upsertPage(novel.id,{...rawPage,visual_key:visualKey,image_status:'planned'});
      pageCounter++;
      if(rawPage.media_prompt)plannedImages++;
    }
    previousSummary=chapter.summary;
    previousTail=chapter.pages.at(-1)?.body?.slice(-1800)||'';
    await store.updateNovel(novel.id,{title:plan.title,generated_pages:pageCounter,status:'generating'});
    console.log('NIGHT_LINEAR_TEXT_PROGRESS',JSON.stringify({novel_id:novel.id,chapter:chapterIndex+1,pages:pageCounter,total:STORY_TOTAL_PAGES}));
  }

  if(pageCounter!==STORY_TOTAL_PAGES)throw new Error(`NIGHT_LINEAR_PAGE_COUNT_MISMATCH:${pageCounter}`);
  await store.updateNovel(novel.id,{status:'illustrating',generated_pages:pageCounter});
  console.log('NIGHT_LINEAR_VISUAL_PLAN',JSON.stringify({novel_id:novel.id,planned_images:plannedImages,total_pages:STORY_TOTAL_PAGES}));

  let images=0;
  for(let pageNo=1;pageNo<=STORY_TOTAL_PAGES;pageNo++){
    const page=await store.page(novel.id,pageNo);
    if(!page)throw new Error(`NIGHT_LINEAR_PAGE_MISSING:${pageNo}`);
    if(!String(page.media_prompt||'').trim())continue;
    const image=await ensureImage({novelId:novel.id,page});
    await store.markImage(novel.id,pageNo,'ready');
    images++;
    await store.updateNovel(novel.id,{status:'illustrating',generated_pages:STORY_TOTAL_PAGES,generated_images:images});
    console.log('NIGHT_LINEAR_IMAGE_PROGRESS',JSON.stringify({novel_id:novel.id,page:pageNo,images,planned:plannedImages,cached:image.cached,model:image.model}));
  }

  if(images!==plannedImages)throw new Error(`NIGHT_LINEAR_IMAGE_COUNT_MISMATCH:${images}:${plannedImages}`);
  await store.updateNovel(novel.id,{status:'complete',generated_pages:STORY_TOTAL_PAGES,generated_images:images,error:''});
  console.log('NIGHT_LINEAR_NOVEL_COMPLETE',JSON.stringify({novel_id:novel.id,title:plan.title,pages:STORY_TOTAL_PAGES,images,planned_images:plannedImages,progress:100}));
}catch(error){
  const message=String(error?.stack||error?.message||error).slice(0,1600);
  if(novel?.id)await store.updateNovel(novel.id,{status:'failed',error:message}).catch(()=>{});
  console.error('NIGHT_LINEAR_NOVEL_FAILED',message);
  process.exitCode=1;
}finally{
  await pool.end().catch(()=>{});
}
