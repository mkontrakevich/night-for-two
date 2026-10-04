import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
import {completeAIText} from '../src/ai/provider-router.js';
import {generateSerialNovelPlan} from '../src/night-serial-novel-architect.js';
import {createNightLinearNovelStore} from '../src/night-linear-novel-store.js';
import {createNightVisualAI} from '../src/night-for-two-visual-ai.js';
import {STORY_ARC,STORY_PAGE_PLAN,STORY_TOTAL_PAGES,storyPageOffset} from '../src/night-story-flow.js';
import {createNightRelationshipBridge} from '../src/integrations/relationship-context-connector.js';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
if(!process.env.OPENROUTER_API_KEY)throw new Error('OPENROUTER_API_KEY_MISSING');

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const store=createNightLinearNovelStore({pool});
const visualAI=createNightVisualAI();
const relationshipBridge=createNightRelationshipBridge();

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
let narrativeSkillCache='';
async function narrativeSkillExcerpt(){
  if(narrativeSkillCache)return narrativeSkillCache;
  try{
    const url=new URL('../skills/couple-space/intimate-narrative/SKILL.md',import.meta.url);
    const raw=await fs.readFile(url,'utf8');
    const sections=['## 3. Storyteller behavior','## 6. Professional visual language','## 9. Image master prompt template','## 15. Provider refusal behavior','## 16. Quality control','## 17A. Dialogue contract','## 17B. Story illustration contract','## 17C. Prose complexity contract','## 17D. Character interaction and purposeful dialogue contract','## 17E. Consequential player-choice contract'];
    const chunks=[];
    for(const title of sections){
      const start=raw.indexOf(title);if(start<0)continue;
      const next=raw.indexOf('\n## ',start+4);
      chunks.push(raw.slice(start,next<0?raw.length:next));
    }
    narrativeSkillCache=chunks.join('\n\n').slice(0,16000);
  }catch(error){
    console.warn('NIGHT_NARRATIVE_SKILL_LOAD_FAILED',String(error?.message||error).slice(0,180));
    narrativeSkillCache='';
  }
  return narrativeSkillCache;
}
function planDigest(plan={}){
  return {
    title:plan.title,logline:plan.logline,controlling_idea:plan.controlling_idea,dramatic_question:plan.dramatic_question,
    erotic_promise:plan.erotic_promise,genre_mix:plan.genre_mix,world_bible:plan.world_bible,
    protagonists:plan.protagonists,supporting_characters:plan.supporting_characters,
    master_plot:plan.master_plot,episodes:plan.episodes,thread_graph:plan.thread_graph,
    plant_payoff_ledger:plan.plant_payoff_ledger,finale_contract:plan.finale_contract,style_bible:plan.style_bible
  };
}

function hasPersistedPlan(plan={}){
  return Array.isArray(plan?.episodes)&&plan.episodes.length>0;
}
function completedChapterBoundary(generatedPages=0){
  const target=Math.max(0,Number(generatedPages)||0);
  let pages=0,chapter=0;
  for(let i=0;i<STORY_PAGE_PLAN.length;i++){
    const next=pages+STORY_PAGE_PLAN[i];
    if(target<next)break;
    pages=next;
    chapter=i+1;
  }
  return {chapter,pages};
}
function episodeSummary(plan={},index=-1){
  if(index<0)return '';
  return clean(JSON.stringify(plan?.episodes?.[index]||{}),1600);
}
function validateChapter(raw,{chapterIndex,pageCount,startPage,final=false}){
  const data=parseJson(raw),chapterTitle=clean(data?.chapter_title,180),summary=clean(data?.summary,1600);
  const pages=Array.isArray(data?.pages)?data.pages:[];
  if(!chapterTitle||!summary||pages.length!==pageCount)throw new Error(`NIGHT_LINEAR_CHAPTER_INVALID:${chapterIndex+1}`);
  const normalized=pages.map((p,i)=>{
    const body=clean(p?.text,9000),pageTitle=clean(p?.title,180),requested=Boolean(p?.illustrate),mediaPrompt=requested?clean(p?.media_prompt,1200):'';
    if(body.length<500)throw new Error(`NIGHT_LINEAR_PAGE_INVALID:${startPage+i}`);
    if(/(^|\n)\s*[—–-]\s+\p{L}/u.test(body))throw new Error(`NIGHT_LINEAR_ANONYMOUS_DIALOGUE:${startPage+i}`);
    if(requested&&!mediaPrompt)throw new Error(`NIGHT_LINEAR_MEDIA_PROMPT_INVALID:${startPage+i}`);
    return {page_no:startPage+i,chapter_no:chapterIndex+1,chapter_title:chapterTitle,page_title:pageTitle,body,media_prompt:mediaPrompt,illustrate:Boolean(mediaPrompt)};
  });
  let illustratedPages=normalized.filter(p=>p.illustrate);
  if(illustratedPages.length>2){
    const keep=new Set([illustratedPages[0].page_no,illustratedPages.at(-1).page_no]);
    for(const page of normalized){
      if(page.illustrate&&!keep.has(page.page_no)){
        page.illustrate=false;
        page.media_prompt='';
      }
    }
    console.warn('NIGHT_LINEAR_ILLUSTRATION_DENSITY_TRIMMED',JSON.stringify({
      chapter:chapterIndex+1,
      from:illustratedPages.length,
      to:2,
      kept:[...keep]
    }));
    illustratedPages=normalized.filter(p=>p.illustrate);
  }
  const illustrated=illustratedPages.length,minIllustrations=(chapterIndex===0||final)?2:1;
  if(illustrated<minIllustrations)throw new Error(`NIGHT_LINEAR_ILLUSTRATION_DENSITY_INVALID:${chapterIndex+1}:${illustrated}`);
  if(final&&!/конец|утро|тишин|рассвет|финал|после/i.test(normalized.at(-1)?.body||'')){
    console.warn('NIGHT_LINEAR_FINALE_SOFT_CHECK',JSON.stringify({chapter:chapterIndex+1}));
  }
  return {chapter_title:chapterTitle,summary,pages:normalized};
}

function pageValidationIssue(page={},pageNo=0){
  const body=clean(page?.text,9000),requested=Boolean(page?.illustrate),mediaPrompt=requested?clean(page?.media_prompt,1200):'';
  if(body.length<500)return `NIGHT_LINEAR_PAGE_INVALID:${pageNo}`;
  if(/(^|\n)\s*[—–-]\s+\p{L}/u.test(body))return `NIGHT_LINEAR_ANONYMOUS_DIALOGUE:${pageNo}`;
  if(requested&&!mediaPrompt)return `NIGHT_LINEAR_MEDIA_PROMPT_INVALID:${pageNo}`;
  return '';
}

async function repairInvalidChapterPages({raw,plan,chapterIndex,pageCount,startPage,final,previousSummary='',previousTail='',bookSeed='',relationshipProfile={}}){
  const data=parseJson(raw);
  if(!clean(data?.chapter_title,180)||!clean(data?.summary,1600)||!Array.isArray(data?.pages)||data.pages.length!==pageCount){
    throw new Error(`NIGHT_LINEAR_PAGE_REPAIR_SHAPE_INVALID:${chapterIndex+1}`);
  }

  for(let pass=1;pass<=2;pass++){
    let repairedAny=false;
    for(let i=0;i<data.pages.length;i++){
      const pageNo=startPage+i;
      const issue=pageValidationIssue(data.pages[i],pageNo);
      if(!issue)continue;

      const original=data.pages[i]||{};
      const illustrateRequired=Boolean(original.illustrate);
      let repairedPage=null,last=null;
      for(let attempt=1;attempt<=2;attempt++){
        try{
          console.warn('NIGHT_LINEAR_PAGE_REPAIR',JSON.stringify({chapter:chapterIndex+1,page:pageNo,pass,attempt,issue}));
          const rawPage=await completeAIText({
            contour:'wife',
            requestName:'night_linear_novel_page_repair',
            skipDatabaseContext:true,
            temperature:.44,
            maxTokens:2600,
            messages:[
              {role:'system',content:`Ты литературный редактор. Исправь ТОЛЬКО ОДНУ экранную страницу главы, не меняя событий до и после неё.

Верни ТОЛЬКО JSON одного объекта:
{"title":"","text":"","illustrate":false,"media_prompt":""}

Жёсткие требования:
— text: законченный фрагмент художественной прозы 120–190 русских слов, НЕ МЕНЕЕ 700 символов;
— не пересказывай страницу кратко и не обрывай сцену;
— сохрани факты, имена, пространство, одежду, мотивацию и причинно-следственную связь с соседними страницами;
— каждая прямая реплика начинается с имени говорящего и двоеточия; анонимные реплики через тире запрещены;
— illustrate ОБЯЗАН быть ${illustrateRequired?'true':'false'};
— если illustrate=true, media_prompt непустой и описывает именно этот кадр; если false — media_prompt="";
— никакого Markdown и текста вне JSON.`},
              {role:'user',content:JSON.stringify({
                VALIDATION_ERROR:issue,
                PAGE_NUMBER:pageNo,
                CHAPTER_NUMBER:chapterIndex+1,
                ORIGINAL_PAGE:original,
                PREVIOUS_PAGE_TAIL:clean(data.pages[i-1]?.text||previousTail,1800).slice(-1800),
                NEXT_PAGE_HEAD:clean(data.pages[i+1]?.text||'',1800).slice(0,1800),
                CHAPTER_TITLE:data.chapter_title,
                CHAPTER_SUMMARY:data.summary,
                BOOK_SEED:bookSeed,
                NOVEL_PLAN:planDigest(plan),
                PREVIOUS_CHAPTER_SUMMARY:previousSummary,
                RELATIONSHIP_PROFILE:relationshipProfile
              })}
            ]
          });
          const parsed=parseJson(rawPage);
          const candidate={
            title:clean(parsed?.title||original?.title,180),
            text:clean(parsed?.text,9000),
            illustrate:illustrateRequired,
            media_prompt:illustrateRequired?clean(parsed?.media_prompt,1200):''
          };
          const candidateIssue=pageValidationIssue(candidate,pageNo);
          if(candidateIssue)throw new Error(candidateIssue);
          repairedPage=candidate;
          break;
        }catch(error){
          last=error;
          console.warn('NIGHT_LINEAR_PAGE_REPAIR_FAILED',JSON.stringify({chapter:chapterIndex+1,page:pageNo,pass,attempt,error:String(error?.message||error).slice(0,220)}));
          await sleep(900*attempt);
        }
      }
      if(!repairedPage)throw last||new Error(`NIGHT_LINEAR_PAGE_REPAIR_FAILED:${pageNo}`);
      data.pages[i]=repairedPage;
      repairedAny=true;
    }

    try{return validateChapter(data,{chapterIndex,pageCount,startPage,final})}
    catch(error){
      if(!repairedAny||pass===2)throw error;
    }
  }
  return validateChapter(data,{chapterIndex,pageCount,startPage,final});
}

async function generateChapter({plan,chapterIndex,previousSummary='',previousTail='',bookSeed='',relationshipProfile={}}) {
  const narrativeSkill=await narrativeSkillExcerpt();
  const pageCount=STORY_PAGE_PLAN[chapterIndex],arc=STORY_ARC[chapterIndex],startPage=storyPageOffset(chapterIndex)+1,final=chapterIndex===STORY_ARC.length-1;
  let last=null,lastRaw='';
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const raw=await completeAIText({
        contour:'wife',
        requestName:'night_linear_novel_chapter',
        skipDatabaseContext:true,
        temperature:.72,
        maxTokens:9000,
        messages:[
          {role:'system',content:`Ты пишешь полностью оригинальный литературный сериал для двух вымышленных совершеннолетних героев — мужчины и женщины. Это законченный роман для приватного мобильного чтения, а не анкета и не инструкция игрокам.

Жанр: взрослый романтический/эротический триллер или драма с интригой. Все персонажи, участвующие в интимных сценах, однозначно совершеннолетние. Любая близость добровольна. Текст может быть чувственным и эротическим, но должен оставаться литературным: эмоции, напряжение, прикосновения, поцелуи, телесность, желание и последствия важнее анатомической детализации.

${narrativeSkill?`\nКАНОНИЧЕСКИЙ NARRATIVE SKILL:\n${narrativeSkill}\n`:''}\nДИАЛОГИ — ОБЯЗАТЕЛЬНЫЙ КОНТРАКТ:
— каждую прямую реплику начинай с имени говорящего и двоеточия: «Марк: ...», «Ева: ...», для второстепенных героев — их имя;
— не оставляй анонимных реплик через тире;
— диалог должен работать через подтекст, недосказанность, возврат к ранее сказанному, индивидуальный ритм, микроиронию, паузы и смену инициативы;
— не используй диалог как пересказ экспозиции;
— особенности общения пары бери только из RELATIONSHIP_PROFILE: ритм, темы, юмор, способы сближения/дистанцирования, предпочтения и повторяющиеся динамики;
— не цитируй исходные личные сообщения и не сообщай читателю, что проводился анализ Telegram; превращай агрегированные наблюдения в художественную манеру общения персонажей.

ЛИТЕРАТУРНАЯ СЛОЖНОСТЬ — ОБЯЗАТЕЛЬНО:
— усложняй текст через причинность, подтекст, конфликт мотивов, последствия решений и переосмысление ранее посеянных деталей;
— не компенсируй простоту сюжета эпитетами: избегай цепочек прилагательных, декоративных наречий и нескольких метафор подряд;
— каждый абзац должен менять ситуацию, мотив, напряжение, знание читателя или смысл ранее показанной детали;
— не называй эмоцию, если она уже понятна из поступка, реплики, паузы или выбора;
— финал каждой сцены должен оставлять изменившееся состояние, а не просто красивое настроение.

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
            CHAPTER:{index:chapterIndex+1,label:arc.label,purpose:arc.purpose,page_count:pageCount,start_page:startPage,final},
            RELATIONSHIP_PROFILE:relationshipProfile
          })}
        ]
      });
      lastRaw=raw;
      return validateChapter(raw,{chapterIndex,pageCount,startPage,final});
    }catch(error){
      last=error;
      console.warn('NIGHT_LINEAR_CHAPTER_RETRY',JSON.stringify({chapter:chapterIndex+1,attempt,error:String(error?.message||error).slice(0,220)}));
      await sleep(1200*attempt);
    }
  }
  let repairSource=lastRaw;
  for(let repairAttempt=1;repairSource&&repairAttempt<=2;repairAttempt++){
    try{
      console.warn('NIGHT_LINEAR_CHAPTER_REPAIR',JSON.stringify({chapter:chapterIndex+1,attempt:repairAttempt,error:String(last?.message||last||'validation_failed').slice(0,220)}));
      const repaired=await completeAIText({
        contour:'wife',
        requestName:'night_linear_novel_chapter_repair',
        skipDatabaseContext:true,
        temperature:.48,
        maxTokens:10000,
        messages:[
          {role:'system',content:`Ты литературный редактор. Исправь JSON главы романа так, чтобы он СТРОГО прошёл машинную валидацию, не меняя сюжет и имена.

Верни ТОЛЬКО полный JSON вида:
{"chapter_title":"","summary":"","pages":[{"title":"","text":"","illustrate":false,"media_prompt":""}]}

Обязательные требования:
— ровно ${pageCount} элементов pages;
— text каждой страницы: полноценная художественная проза, 120–190 русских слов и НЕ МЕНЕЕ 650 символов;
— никаких пустых или конспективных страниц;
— каждая прямая реплика начинается с имени говорящего и двоеточия; анонимных реплик через тире быть не должно;
— chapter_title и summary непустые;
— illustrate=true только на 1–2 страницах; для ${chapterIndex===0||final?'этой главы — РОВНО 2':'этой главы — от 1 до 2'};
— при illustrate=true media_prompt непустой, при false media_prompt="";
— сохрани непрерывность истории, факты NOVEL_PLAN и последствия предыдущей главы;
— не добавляй Markdown, комментарии, пояснения или текст вне JSON.`},
          {role:'user',content:JSON.stringify({
            VALIDATION_ERROR:String(last?.message||last||'validation_failed').slice(0,500),
            PREVIOUS_OUTPUT:repairSource,
            BOOK_SEED:bookSeed,
            NOVEL_PLAN:planDigest(plan),
            PREVIOUS_CHAPTER_SUMMARY:previousSummary,
            PREVIOUS_TAIL:previousTail,
            CHAPTER:{index:chapterIndex+1,label:arc.label,purpose:arc.purpose,page_count:pageCount,start_page:startPage,final},
            RELATIONSHIP_PROFILE:relationshipProfile
          })}
        ]
      });
      repairSource=repaired;
      return validateChapter(repaired,{chapterIndex,pageCount,startPage,final});
    }catch(error){
      last=error;
      console.warn('NIGHT_LINEAR_CHAPTER_REPAIR_FAILED',JSON.stringify({chapter:chapterIndex+1,attempt:repairAttempt,error:String(error?.message||error).slice(0,220)}));
      await sleep(1200*repairAttempt);
    }
  }
  if(repairSource){
    try{
      return await repairInvalidChapterPages({
        raw:repairSource,plan,chapterIndex,pageCount,startPage,final,
        previousSummary,previousTail,bookSeed,relationshipProfile
      });
    }catch(error){
      last=error;
      console.warn('NIGHT_LINEAR_PAGE_REPAIR_EXHAUSTED',JSON.stringify({chapter:chapterIndex+1,error:String(error?.message||error).slice(0,220)}));
    }
  }
  throw last||new Error(`NIGHT_LINEAR_CHAPTER_FAILED:${chapterIndex+1}`);
}

async function ensureImage({novelId,page}){
  const key=page.visual_key||`linear-novel-${novelId}-page-${String(page.page_no).padStart(3,'0')}`;
  const qaRequired=process.env.NIGHT_VISUAL_QA_REQUIRED!=='0';
  const qaThreshold=Math.max(0.5,Math.min(0.99,Number(process.env.NIGHT_VISUAL_QA_THRESHOLD)||0.78));
  let last=null,qaFeedback='';
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const correction=qaFeedback
        ? `\nSTRICT VISUAL QA CORRECTION FOR RETRY ${attempt}: ${qaFeedback}\nPreserve all other scene details, but fix this mismatch exactly. Do not invert who touches whom, camera direction, body orientation, relative position, or action.`
        : '';
      const result=await visualAI.ensure({
        key,
        theme:'boudoir',
        mode:page.page_no===STORY_TOTAL_PAGES?'story_final':'story_scene',
        variant:`BOOK_PAGE: ${page.media_prompt}${correction}`,
        pageText:page.body,
        force:attempt>1
      });
      if(!result?.buffer?.length)throw new Error('NIGHT_LINEAR_IMAGE_EMPTY');

      let qa={available:false,pass:!qaRequired,score:qaRequired?0:1,mismatches:[],model:''};
      try{
        qa=await visualAI.assess({buffer:result.buffer,pageText:page.body,mediaPrompt:page.media_prompt});
      }catch(error){
        if(qaRequired)throw error;
        console.warn('NIGHT_VISUAL_QA_OPTIONAL_FAILED',JSON.stringify({page:page.page_no,error:String(error?.message||error).slice(0,220)}));
      }

      const passed=qaRequired?(qa.available&&qa.pass&&Number(qa.score)>=qaThreshold):(!qa.available||qa.pass);
      await visualAI.recordQuality({key,qa:{...qa,threshold:qaThreshold,passed}});

      if(!passed){
        const mismatches=(qa.mismatches||[]).map(v=>String(v).trim()).filter(Boolean);
        qaFeedback=mismatches.join(' | ').slice(0,1200)||`QA score ${Number(qa.score||0).toFixed(2)} below required threshold ${qaThreshold.toFixed(2)}`;
        console.warn('NIGHT_VISUAL_QA_FEEDBACK',JSON.stringify({page:page.page_no,attempt,score:Number(qa.score||0),feedback:qaFeedback.slice(0,500)}));
        await visualAI.archiveRejected({key,attempt,qa:{...qa,threshold:qaThreshold,passed:false}});
        throw new Error(`NIGHT_VISUAL_QA_REJECTED:${page.page_no}:${Number(qa.score||0).toFixed(2)}:${qaFeedback.slice(0,500)}`);
      }

      return {key,model:result.model||'',cached:Boolean(result.cached),qa:{...qa,threshold:qaThreshold,passed:true}};
    }catch(error){
      last=error;
      console.warn('NIGHT_LINEAR_IMAGE_RETRY',JSON.stringify({page:page.page_no,attempt,error:String(error?.message||error).slice(0,320)}));
      await sleep(1800*attempt);
    }
  }
  throw last||new Error(`NIGHT_LINEAR_IMAGE_FAILED:${page.page_no}`);
}

let novel=null;
try{
  await store.init();
  const resumeId=Math.max(0,Number(process.env.NIGHT_RESUME_NOVEL_ID)||0);

  if(resumeId){
    novel=await store.get(resumeId);
    if(!novel)throw new Error(`NIGHT_LINEAR_RESUME_NOT_FOUND:${resumeId}`);
    const failedError=String(novel.error||'');
    const generatedPages=Math.max(0,Number(novel.generated_pages)||0);
    const totalPages=Math.max(1,Number(novel.total_pages)||STORY_TOTAL_PAGES);
    const retryablePlan=generatedPages===0&&/NIGHT_NOVEL_(?:STRUCTURE_TOO_THIN|PROTAGONISTS_INVALID|ROLE_PAIR_INVALID|PLAN_FAILED)/.test(failedError);
    const retryableGeneration=/(?:NIGHT_LINEAR_(?:CHAPTER_INVALID|PAGE_INVALID|ANONYMOUS_DIALOGUE|MEDIA_PROMPT_INVALID|ILLUSTRATION_DENSITY_INVALID|PAGE_COUNT_MISMATCH|PAGE_MISSING|IMAGE_FAILED|IMAGE_COUNT_MISMATCH|RESUME_STATUS_INVALID)|NIGHT_VISUAL_QA_REJECTED)/.test(failedError);
    const retryableFailed=String(novel.status)==='failed'&&(retryablePlan||retryableGeneration);
    if(!['generating','illustrating'].includes(String(novel.status))&&!retryableFailed)throw new Error(`NIGHT_LINEAR_RESUME_STATUS_INVALID:${resumeId}:${novel.status}`);
    if(retryableFailed){
      const retryStatus=generatedPages>=totalPages?'illustrating':'generating';
      novel=await store.updateNovel(novel.id,{status:retryStatus,error:''});
      console.log('NIGHT_LINEAR_NOVEL_RETRY',JSON.stringify({novel_id:novel.id,reason:retryablePlan?'recoverable_plan_failure':'recoverable_generation_failure',status:retryStatus}));
    }
    console.log('NIGHT_LINEAR_NOVEL_RESUME',JSON.stringify({novel_id:novel.id,status:novel.status,generated_pages:Number(novel.generated_pages)||0,generated_images:Number(novel.generated_images)||0}));
  }else{
    const freshBookSeed=crypto.randomBytes(18).toString('hex');
    console.log('NIGHT_LINEAR_NOVEL_START',JSON.stringify({book_seed:freshBookSeed,total_pages:STORY_TOTAL_PAGES}));
    novel=await store.create({bookSeed:freshBookSeed,title:'Ночь на двоих',plan:{phase:'planning'},totalPages:STORY_TOTAL_PAGES});
    console.log('NIGHT_LINEAR_NOVEL_RESERVED',JSON.stringify({novel_id:novel.id,total_pages:STORY_TOTAL_PAGES}));
  }

  const bookSeed=String(novel.book_seed||'');
  const relationshipProfile=await relationshipBridge.context();
  console.log('NIGHT_RELATIONSHIP_CONTEXT_READY',JSON.stringify({policy:relationshipProfile.policy,observations:relationshipProfile.observations?.length||0,preferences:relationshipProfile.preferences?.length||0,dynamics:relationshipProfile.dynamics?.length||0,raw_messages:false}));

  let plan=novel.plan||{};
  if(!hasPersistedPlan(plan)){
    plan=await generateSerialNovelPlan({
      bookSeed,
      relationshipProfile,
      mutualWishes:[],
      generate:request=>completeAIText({...request,skipDatabaseContext:true})
    });
    novel=await store.updateNovel(novel.id,{title:plan.title||'Ночь на двоих',plan,status:'generating',error:''});
    console.log('NIGHT_LINEAR_PLAN_READY',JSON.stringify({novel_id:novel.id,title:plan.title,episodes:plan.episodes?.length||0,resumed:Boolean(resumeId)}));
  }else{
    console.log('NIGHT_LINEAR_PLAN_REUSED',JSON.stringify({novel_id:novel.id,title:plan.title||novel.title,episodes:plan.episodes?.length||0}));
  }

  let pageCounter=Math.max(0,Number(novel.generated_pages)||0),previousSummary='',previousTail='';
  const boundary=completedChapterBoundary(pageCounter);
  let startChapter=boundary.chapter;
  if(pageCounter!==boundary.pages){
    console.warn('NIGHT_LINEAR_RESUME_REWIND',JSON.stringify({novel_id:novel.id,from_pages:pageCounter,to_pages:boundary.pages,start_chapter:startChapter+1}));
    pageCounter=boundary.pages;
    novel=await store.updateNovel(novel.id,{generated_pages:pageCounter,status:'generating'});
  }
  if(pageCounter>0){
    const previousPage=await store.page(novel.id,pageCounter);
    previousTail=String(previousPage?.body||'').slice(-1800);
    previousSummary=episodeSummary(plan,startChapter-1);
  }

  if(String(novel.status)!=='illustrating'&&pageCounter<STORY_TOTAL_PAGES){
    for(let chapterIndex=startChapter;chapterIndex<STORY_ARC.length;chapterIndex++){
    const chapter=await generateChapter({plan,chapterIndex,previousSummary,previousTail,bookSeed,relationshipProfile});
    for(const rawPage of chapter.pages){
      const visualKey=rawPage.media_prompt?`linear-novel-${novel.id}-page-${String(rawPage.page_no).padStart(3,'0')}`:'';
      await store.upsertPage(novel.id,{...rawPage,visual_key:visualKey,image_status:'planned'});
      pageCounter++;
      // Visual count is recalculated from persisted pages so resume cannot double-count illustrations.
    }
    previousSummary=chapter.summary;
    previousTail=chapter.pages.at(-1)?.body?.slice(-1800)||'';
    await store.updateNovel(novel.id,{title:plan.title,generated_pages:pageCounter,status:'generating'});
    console.log('NIGHT_LINEAR_TEXT_PROGRESS',JSON.stringify({novel_id:novel.id,chapter:chapterIndex+1,pages:pageCounter,total:STORY_TOTAL_PAGES}));
    }
  }

  if(pageCounter!==STORY_TOTAL_PAGES)throw new Error(`NIGHT_LINEAR_PAGE_COUNT_MISMATCH:${pageCounter}`);
  const visualStats=await store.imageStats(novel.id);
  const plannedImages=visualStats.planned;
  await store.updateNovel(novel.id,{status:'illustrating',generated_pages:pageCounter,generated_images:visualStats.ready});
  console.log('NIGHT_LINEAR_VISUAL_PLAN',JSON.stringify({novel_id:novel.id,planned_images:plannedImages,ready_images:visualStats.ready,total_pages:STORY_TOTAL_PAGES,resumed:Boolean(resumeId)}));

  let images=visualStats.ready,failedImages=0;
  for(let pageNo=1;pageNo<=STORY_TOTAL_PAGES;pageNo++){
    const page=await store.page(novel.id,pageNo);
    if(!page)throw new Error(`NIGHT_LINEAR_PAGE_MISSING:${pageNo}`);
    if(!String(page.media_prompt||'').trim())continue;
    if(page.image_status==='ready')continue;
    try{
      const image=await ensureImage({novelId:novel.id,page});
      await store.markImage(novel.id,pageNo,'ready');
      images++;
      await store.updateNovel(novel.id,{status:'illustrating',generated_pages:STORY_TOTAL_PAGES,generated_images:images});
      console.log('NIGHT_LINEAR_IMAGE_PROGRESS',JSON.stringify({novel_id:novel.id,page:pageNo,images,planned:plannedImages,cached:image.cached,model:image.model,qa_score:image.qa?.score??null,qa_model:image.qa?.model||'',qa_passed:Boolean(image.qa?.passed)}));
    }catch(error){
      failedImages++;
      await store.markImage(novel.id,pageNo,'failed').catch(()=>{});
      console.error('NIGHT_LINEAR_IMAGE_SKIPPED',JSON.stringify({novel_id:novel.id,page:pageNo,error:String(error?.message||error).slice(0,420)}));
    }
  }

  const finalStats=await store.imageStats(novel.id);
  images=finalStats.ready;
  const pendingImages=Math.max(0,plannedImages-images);
  const illustrationWarning=pendingImages?`NIGHT_LINEAR_ILLUSTRATIONS_PENDING:${pendingImages}`:'';
  await store.updateNovel(novel.id,{status:'complete',generated_pages:STORY_TOTAL_PAGES,generated_images:images,error:illustrationWarning});
  console.log('NIGHT_LINEAR_NOVEL_COMPLETE',JSON.stringify({novel_id:novel.id,title:plan.title,pages:STORY_TOTAL_PAGES,images,planned_images:plannedImages,pending_images:pendingImages,failed_images:failedImages,illustrations_complete:pendingImages===0,progress:100}));
}catch(error){
  const message=String(error?.stack||error?.message||error).slice(0,1600);
  if(novel?.id)await store.updateNovel(novel.id,{status:'failed',error:message}).catch(()=>{});
  console.error('NIGHT_LINEAR_NOVEL_FAILED',message);
  process.exitCode=1;
}finally{
  await pool.end().catch(()=>{});
}
