import pg from 'pg';
import {spawnSync} from 'node:child_process';
import {completeAIText} from '../src/ai/provider-router.js';

const {Pool}=pg;
const NOVEL_ID=5;
const PAGE_NO=65;
const parse=v=>JSON.parse(String(v||'').replace(/^```(?:json)?\s*|\s*```$/g,''));

async function usage(){
  try{
    const key=String(process.env.OPENROUTER_API_KEY||'');
    if(!key)return null;
    const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{authorization:'Bearer '+key}});
    if(!r.ok)return null;
    const j=await r.json(),d=j?.data||j||{};
    return {usage:Number(d.usage),daily:Number(d.usage_daily),monthly:Number(d.usage_monthly)};
  }catch{return null;}
}

let pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
let before=null;
try{
  before=await usage();
  console.log('OPENROUTER_PAGE65_BEFORE '+JSON.stringify(before));

  const novel=(await pool.query("SELECT id,status,generated_pages,total_pages,generated_images,error FROM night_linear_novels WHERE id=$1",[NOVEL_ID])).rows[0];
  const page=(await pool.query("SELECT page_no,chapter_no,chapter_title,page_title,body,media_prompt,visual_key,image_status FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no=$2",[NOVEL_ID,PAGE_NO])).rows[0];
  const prev=(await pool.query("SELECT page_no,body,media_prompt FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no<$2 AND media_prompt<>'' AND image_status='ready' ORDER BY page_no DESC LIMIT 1",[NOVEL_ID,PAGE_NO])).rows[0]||null;
  const next=(await pool.query("SELECT page_no,body,media_prompt FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no>$2 AND media_prompt<>'' AND image_status='ready' ORDER BY page_no ASC LIMIT 1",[NOVEL_ID,PAGE_NO])).rows[0]||null;

  if(!novel||Number(novel.generated_pages)!==100||Number(novel.total_pages)!==100)throw new Error('PAGE65_NOVEL_GUARD_FAILED');
  if(!page||String(page.image_status)!=='failed'||!String(page.body||'').trim())throw new Error('PAGE65_PAGE_GUARD_FAILED');

  const raw=await completeAIText({
    contour:'wife',
    requestName:'night_sd_story_prompt_repair',
    skipDatabaseContext:true,
    temperature:.3,
    maxTokens:1600,
    messages:[
      {role:'system',content:`Ты visual prompt director. Перепиши prompt ОДНОЙ иллюстрации строго по канону SD Story Illustration Skill.

Верни только JSON {"prompt":"..."}.

Prompt обязан идти в этом порядке:
SHOT TYPE
→ STORY / ACTION
→ BODY LANGUAGE / SUBJECT SCALE
→ EMOTION / ATMOSPHERE
→ WARDROBE / PROPS / TEXTURES
→ ENVIRONMENT
→ LIGHT / TIME
→ CAMERA / LENS
→ COLOR / FILM CHARACTER
→ IDENTITY LOCK
→ CONTINUITY LOCK.

Правила:
— изображай только событие PAGE_TEXT, не придумывай новый сюжет;
— PREVIOUS_VISUAL и NEXT_VISUAL — только continuity anchors;
— сохраняй количество и идентичность уже установленных взрослых вымышленных персонажей;
— сохраняй одежду, предметы, архитектуру, время суток и направление действия, если текст их не меняет;
— 35–50 mm для среды, 65–85 mm для портретной близости, 85–110 mm для детали;
— без текста, логотипов, watermark, лишних персонажей, malformed anatomy, fused hands, duplicate people;
— без явной наготы или сексуального акта;
— prompt конкретный, кинематографичный, без комментариев.`},
      {role:'user',content:JSON.stringify({
        PAGE_NUMBER:PAGE_NO,
        CHAPTER:page.chapter_title,
        PAGE_TITLE:page.page_title,
        PAGE_TEXT:String(page.body||'').slice(0,7000),
        OLD_PROMPT:String(page.media_prompt||''),
        PREVIOUS_VISUAL:prev?{page_no:prev.page_no,prompt:prev.media_prompt,text:String(prev.body||'').slice(-1400)}:null,
        NEXT_VISUAL:next?{page_no:next.page_no,prompt:next.media_prompt,text:String(next.body||'').slice(0,1400)}:null
      })}
    ]
  });
  const data=parse(raw);
  const prompt=String(data?.prompt||'').trim();
  if(prompt.length<350)throw new Error('PAGE65_SD_PROMPT_TOO_SHORT:'+prompt.length);

  await pool.query("UPDATE night_linear_novel_pages SET media_prompt=$3,image_status='failed' WHERE novel_id=$1 AND page_no=$2",[NOVEL_ID,PAGE_NO,prompt]);
  await pool.query("UPDATE night_linear_novels SET status='illustrating',error='',updated_at=now() WHERE id=$1",[NOVEL_ID]);
  console.log('NIGHT_PAGE65_SD_PROMPT_READY '+JSON.stringify({
    page_no:PAGE_NO,prompt_length:prompt.length,previous_visual_page:prev?.page_no||null,next_visual_page:next?.page_no||null,visual_key:page.visual_key
  }));
}finally{
  await pool.end().catch(()=>{});
}

const generation=spawnSync(process.execPath,['scripts/night-generate-linear-novel.mjs'],{
  cwd:'/app',
  env:{...process.env,NIGHT_RESUME_NOVEL_ID:String(NOVEL_ID)},
  stdio:'inherit'
});
if(generation.status!==0)console.warn('NIGHT_PAGE65_GENERATOR_EXIT '+String(generation.status));

pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
  const n=(await pool.query("SELECT id,status,generated_pages,total_pages,generated_images,error FROM night_linear_novels WHERE id=$1",[NOVEL_ID])).rows[0];
  const p=(await pool.query("SELECT page_no,image_status,length(media_prompt) AS prompt_length FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no=$2",[NOVEL_ID,PAGE_NO])).rows[0];
  const stats=(await pool.query("SELECT count(*) FILTER (WHERE media_prompt<>'' AND image_status='ready')::int AS ready,count(*) FILTER (WHERE media_prompt<>'')::int AS planned,count(*) FILTER (WHERE media_prompt<>'' AND image_status='failed')::int AS failed FROM night_linear_novel_pages WHERE novel_id=$1",[NOVEL_ID])).rows[0];
  const ok=String(n?.status)==='complete'&&String(p?.image_status)==='ready'&&Number(stats?.ready)===20&&Number(stats?.planned)===20&&Number(stats?.failed)===0;
  const after=await usage();
  const delta=(before?.usage!=null&&after?.usage!=null)?Math.max(0,after.usage-before.usage):null;
  console.log('NIGHT_PAGE65_SD_REPAIR_RESULT '+JSON.stringify({
    ok,novel_status:String(n?.status||''),generated_images:Number(n?.generated_images)||0,
    page65_status:String(p?.image_status||''),prompt_length:Number(p?.prompt_length)||0,
    ready:Number(stats?.ready)||0,planned:Number(stats?.planned)||0,failed:Number(stats?.failed)||0,error:String(n?.error||''),
    openrouter_usage_delta:delta,openrouter_usage_daily:after?.daily??null,openrouter_usage_monthly:after?.monthly??null
  }));
  if(!ok)process.exitCode=2;
}finally{
  await pool.end().catch(()=>{});
}
