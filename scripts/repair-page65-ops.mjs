import fs from 'node:fs/promises';
import pg from 'pg';
import {completeAIText} from './src/ai/provider-router.js';

const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const NOVEL_ID=5,PAGE_NO=65;
const PHASE=String(process.env.PAGE65_PHASE||'prepare');
const USAGE_FILE='/app/config/night-visuals/page65-repair-usage-before.json';
const clean=(v='',n=6000)=>String(v||'').replace(/\r/g,'').trim().slice(0,n);

async function usage(){
  try{
    const key=String(process.env.OPENROUTER_API_KEY||'');
    if(!key)return null;
    const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{authorization:'Bearer '+key}});
    if(!r.ok)return null;
    const j=await r.json(),d=j?.data||j||{};
    const n=v=>Number.isFinite(Number(v))?Number(v):null;
    return {usage:n(d.usage),daily:n(d.usage_daily),monthly:n(d.usage_monthly)};
  }catch{return null;}
}

async function prepare(){
  const before=await usage();
  const {rows:nrows}=await pool.query(
    "SELECT id,title,status,generated_pages,total_pages,generated_images,plan,error FROM night_linear_novels WHERE id=$1",
    [NOVEL_ID]
  );
  const novel=nrows[0];
  if(!novel)throw new Error('PAGE65_NOVEL_MISSING');
  if(Number(novel.generated_pages)!==100||Number(novel.total_pages)!==100)throw new Error('PAGE65_TEXT_NOT_COMPLETE');
  if(String(novel.status)!=='complete')throw new Error('PAGE65_NOVEL_STATUS_GUARD:'+String(novel.status));

  const {rows:bad}=await pool.query(
    "SELECT page_no,image_status FROM night_linear_novel_pages WHERE novel_id=$1 AND BTRIM(media_prompt)<>'' AND image_status<>'ready' ORDER BY page_no",
    [NOVEL_ID]
  );
  if(bad.length!==1||Number(bad[0].page_no)!==PAGE_NO||String(bad[0].image_status)!=='failed'){
    throw new Error('PAGE65_SINGLE_FAILURE_GUARD:'+JSON.stringify(bad));
  }

  const {rows:prows}=await pool.query(
    "SELECT page_no,chapter_no,chapter_title,page_title,body,media_prompt,visual_key,image_status FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no BETWEEN $2 AND $3 ORDER BY page_no",
    [NOVEL_ID,PAGE_NO-1,PAGE_NO+1]
  );
  const page=prows.find(x=>Number(x.page_no)===PAGE_NO);
  if(!page)throw new Error('PAGE65_PAGE_MISSING');

  const [sdSkill,characterSkill]=await Promise.all([
    fs.readFile('./skills/sd-story-illustration/SKILL.md','utf8'),
    fs.readFile('./skills/real-couple-character-identity/SKILL.md','utf8')
  ]);
  const plan=novel.plan||{};

  const raw=await completeAIText({
    contour:'wife',
    requestName:'night_linear_page65_visual_prompt_repair',
    skipDatabaseContext:true,
    temperature:.32,
    maxTokens:1800,
    messages:[
      {role:'system',content:`You are the visual prompt director for a cinematic illustrated novel. Rebuild ONE production image prompt from the exact page prose and the two canonical visual skills supplied by the application.

Return JSON only: {"media_prompt":"..."}.

The media_prompt MUST contain these labeled blocks in this exact order:
SHOT TYPE:
STORY / ACTION:
BODY LANGUAGE / SUBJECT SCALE:
EMOTION / ATMOSPHERE:
WARDROBE / PROPS / TEXTURES:
ENVIRONMENT:
LIGHT / TIME:
CAMERA / LENS:
COLOR / FILM CHARACTER:
IDENTITY LOCK:
CONTINUITY LOCK:

Rules:
- The target page prose is canonical. Do not invent a different action, room, prop, garment, character position, time or emotional beat.
- Use fictional character identity information from NOVEL_PLAN only.
- Do not infer or include sensitive real-player traits or direct identifiers.
- Preserve A/B character separation, relative scale, wardrobe/prop ownership and continuity with adjacent pages.
- Premium vertical 9:16 editorial/cinematic still.
- Sensuality may be artistic but must remain non-explicit: no visible genitals, no visible nipples, no sexual act, no pornographic framing.
- No text, logo or watermark in the image.

SD STORY ILLUSTRATION SKILL:
${clean(sdSkill,9000)}

CHARACTER IDENTITY SKILL:
${clean(characterSkill,9000)}`},
      {role:'user',content:JSON.stringify({
        NOVEL_TITLE:novel.title,
        NOVEL_PLAN:{
          protagonists:plan.protagonists||[],
          world_bible:plan.world_bible||{},
          style_bible:plan.style_bible||{},
          master_plot:plan.master_plot||{}
        },
        PREVIOUS_PAGE:prows.find(x=>Number(x.page_no)===PAGE_NO-1)||null,
        TARGET_PAGE:{
          page_no:page.page_no,
          chapter_no:page.chapter_no,
          chapter_title:page.chapter_title,
          page_title:page.page_title,
          body:page.body,
          previous_media_prompt:page.media_prompt
        },
        NEXT_PAGE:prows.find(x=>Number(x.page_no)===PAGE_NO+1)||null
      })}
    ]
  });

  const text=String(raw||'').trim().replace(/^```(?:json)?\s*|\s*```$/g,'');
  let parsed;
  try{parsed=JSON.parse(text)}catch{
    const a=text.indexOf('{'),b=text.lastIndexOf('}');
    if(a<0||b<=a)throw new Error('PAGE65_PROMPT_JSON_INVALID');
    parsed=JSON.parse(text.slice(a,b+1));
  }
  const prompt=clean(parsed?.media_prompt,5000);
  if(prompt.length<700)throw new Error('PAGE65_PROMPT_TOO_SHORT:'+prompt.length);

  const order=[
    'SHOT TYPE:','STORY / ACTION:','BODY LANGUAGE / SUBJECT SCALE:','EMOTION / ATMOSPHERE:',
    'WARDROBE / PROPS / TEXTURES:','ENVIRONMENT:','LIGHT / TIME:','CAMERA / LENS:',
    'COLOR / FILM CHARACTER:','IDENTITY LOCK:','CONTINUITY LOCK:'
  ];
  const upper=prompt.toUpperCase();
  let last=-1;
  for(const marker of order){
    const idx=upper.indexOf(marker);
    if(idx<=last)throw new Error('PAGE65_PROMPT_ORDER_INVALID:'+marker);
    last=idx;
  }

  await fs.mkdir('/app/config/night-visuals',{recursive:true});
  await fs.writeFile(USAGE_FILE,JSON.stringify(before||{},null,2));
  await pool.query(
    "UPDATE night_linear_novel_pages SET media_prompt=$3,image_status='planned',updated_at=now() WHERE novel_id=$1 AND page_no=$2",
    [NOVEL_ID,PAGE_NO,prompt]
  );
  await pool.query("UPDATE night_linear_novels SET status='illustrating',error='',updated_at=now() WHERE id=$1",[NOVEL_ID]);

  console.log('NIGHT_PAGE65_PROMPT_REBUILT '+JSON.stringify({
    novel_id:String(NOVEL_ID),
    page_no:PAGE_NO,
    prompt_length:prompt.length,
    sd_skill:true,
    character_identity_skill:true,
    openrouter_usage_before:before?.usage??null
  }));
}

async function verify(){
  const {rows:nrows}=await pool.query(
    "SELECT id,status,generated_pages,total_pages,generated_images,error FROM night_linear_novels WHERE id=$1",
    [NOVEL_ID]
  );
  const novel=nrows[0]||{};
  const {rows:statsRows}=await pool.query(
    "SELECT count(*) FILTER (WHERE BTRIM(media_prompt)<>'' AND image_status='ready')::int AS ready,count(*) FILTER (WHERE BTRIM(media_prompt)<>'')::int AS planned,count(*) FILTER (WHERE BTRIM(media_prompt)<>'' AND image_status='failed')::int AS failed FROM night_linear_novel_pages WHERE novel_id=$1",
    [NOVEL_ID]
  );
  const stats=statsRows[0]||{};
  const {rows:pageRows}=await pool.query(
    "SELECT page_no,image_status,visual_key,length(media_prompt) AS prompt_length FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no=$2",
    [NOVEL_ID,PAGE_NO]
  );
  const page=pageRows[0]||{};
  const metaPath=String(process.env.NIGHT_VISUAL_CACHE_DIR||'/app/config/night-visuals')+'/linear-novel-5-page-065.json';
  let meta=null,before=null;
  try{meta=JSON.parse(await fs.readFile(metaPath,'utf8'));}catch{}
  try{before=JSON.parse(await fs.readFile(USAGE_FILE,'utf8'));}catch{}
  const after=await usage();
  const delta=(before?.usage!=null&&after?.usage!=null)?Math.max(0,Number(after.usage)-Number(before.usage)):null;

  const ok=String(novel.status)==='complete'
    && Number(stats.ready)===20
    && Number(stats.planned)===20
    && Number(stats.failed)===0
    && String(page.image_status)==='ready'
    && Boolean(meta?.qa?.passed);

  console.log('NIGHT_PAGE65_REPAIR_RESULT '+JSON.stringify({
    ok,
    novel_status:String(novel.status||''),
    page65_status:String(page.image_status||''),
    ready:Number(stats.ready)||0,
    planned:Number(stats.planned)||0,
    failed:Number(stats.failed)||0,
    prompt_length:Number(page.prompt_length)||0,
    qa_passed:Boolean(meta?.qa?.passed),
    qa_score:Number(meta?.qa?.score)||null,
    qa_model:String(meta?.qa?.model||''),
    image_model:String(meta?.model||''),
    openrouter_usage_delta:delta,
    openrouter_usage_daily:after?.daily??null,
    openrouter_usage_monthly:after?.monthly??null
  }));
  if(!ok)process.exitCode=2;
}

try{
  if(PHASE==='prepare')await prepare();
  else if(PHASE==='verify')await verify();
  else throw new Error('PAGE65_PHASE_INVALID:'+PHASE);
}catch(error){
  console.error('NIGHT_PAGE65_REPAIR_ERROR',String(error?.stack||error?.message||error).slice(0,1800));
  process.exitCode=1;
}finally{
  await pool.end().catch(()=>{});
}
