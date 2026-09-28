import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');

const args=process.argv.slice(2);
const outArg=args.find(x=>x.startsWith('--output='))?.slice('--output='.length)||'/tmp/night-reader-export';
const outDir=path.resolve(outArg);
const assetsDir=path.join(outDir,'assets','generated');
const cacheDir=process.env.NIGHT_VISUAL_CACHE_DIR||path.join(process.env.CONFIG_DIR||'/app/config','night-visuals');

function safeKey(value=''){return String(value||'visual').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'visual';}
function escJson(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
async function exists(file){try{await fs.access(file);return true}catch{return false}}

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
  const {rows:[novel]}=await pool.query(`
    SELECT * FROM night_linear_novels
    WHERE status='complete'
    ORDER BY completed_at DESC NULLS LAST,id DESC
    LIMIT 1
  `);
  if(!novel)throw new Error('NIGHT_EXPORT_COMPLETE_NOVEL_MISSING');

  const {rows:pages}=await pool.query(`
    SELECT page_no,chapter_no,chapter_title,page_title,body,media_prompt,visual_key,image_status
    FROM night_linear_novel_pages
    WHERE novel_id=$1
    ORDER BY page_no
  `,[novel.id]);

  if(pages.length!==Number(novel.total_pages))throw new Error(`NIGHT_EXPORT_PAGE_COUNT_MISMATCH:${pages.length}:${novel.total_pages}`);

  await fs.rm(outDir,{recursive:true,force:true});
  await fs.mkdir(assetsDir,{recursive:true});

  const exported=[];
  for(const page of pages){
    let image='';
    let meta=null;
    if(String(page.media_prompt||'').trim()){
      if(page.image_status!=='ready')throw new Error(`NIGHT_EXPORT_IMAGE_NOT_READY:${page.page_no}`);
      const key=safeKey(page.visual_key||`linear-novel-${novel.id}-page-${String(page.page_no).padStart(3,'0')}`);
      const src=path.join(cacheDir,`${key}.jpg`);
      if(!(await exists(src)))throw new Error(`NIGHT_EXPORT_IMAGE_FILE_MISSING:${page.page_no}:${key}`);
      const name=`page-${String(page.page_no).padStart(3,'0')}.jpg`;
      const dest=path.join(assetsDir,name);
      await fs.copyFile(src,dest);
      image=`assets/generated/${name}`;
      const metaSrc=path.join(cacheDir,`${key}.json`);
      if(await exists(metaSrc)){
        try{meta=JSON.parse(await fs.readFile(metaSrc,'utf8'))}catch{}
      }
    }
    exported.push({
      page_no:Number(page.page_no),
      chapter_no:Number(page.chapter_no),
      chapter_title:String(page.chapter_title||''),
      page_title:String(page.page_title||''),
      body:String(page.body||''),
      image,
      image_meta:meta?{
        model:String(meta.model||''),
        storyboard:Boolean(meta.storyboard),
        prompt_hash:String(meta.prompt_hash||''),
        source_text_hash:String(meta.source_text_hash||'')
      }:null
    });
  }

  const story={
    version:'room17-v2-personalized',
    generated_at:new Date().toISOString(),
    novel:{id:Number(novel.id),title:String(novel.title||'Ночь на двоих'),total_pages:Number(novel.total_pages)},
    privacy:{relationship_context:'sanitized_aggregate_v1',raw_messages:false},
    pages:exported
  };
  await fs.writeFile(path.join(outDir,'story.json'),JSON.stringify(story,null,2));

  const html=`<!doctype html>
<html lang="ru" data-theme="night">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#090706">
<title>${String(novel.title||'Ночь на двоих').replace(/[<>]/g,'')}</title>
<style>
:root{--bg:#090706;--paper:#12100f;--ink:#fff8f1;--muted:#b9aca5;--gold:#d7ae73;--line:rgba(215,174,115,.22);--safe:env(safe-area-inset-bottom)}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}body{overflow:hidden}
.reader{height:100dvh;max-width:840px;margin:auto;position:relative;background:radial-gradient(90% 55% at 50% 0%,rgba(100,28,38,.18),transparent 70%),var(--bg)}
.chrome{position:absolute;z-index:10;top:calc(14px + env(safe-area-inset-top));left:18px;right:18px;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;color:var(--gold);font-size:10px;letter-spacing:.14em;text-transform:uppercase}
.progress{grid-column:1/-1;height:2px;background:rgba(255,255,255,.10);overflow:hidden;border-radius:99px}.progress i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#9d2331)}
.page{height:100%;padding:calc(64px + env(safe-area-inset-top)) 22px calc(86px + var(--safe));display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.page.hasImage{justify-content:flex-end}.media{position:absolute;inset:0;z-index:0}.media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,6,.06),rgba(7,6,6,.38) 48%,rgba(7,6,6,.96) 88%)}.media img{width:100%;height:100%;object-fit:cover;display:block}
.copy{position:relative;z-index:2;max-width:720px;margin:0 auto;width:100%}.kicker{font-size:10px;letter-spacing:.18em;color:var(--gold);text-transform:uppercase;margin-bottom:10px}.title{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(29px,7.4vw,48px);line-height:1.03;letter-spacing:-.035em;margin:0 0 17px}.text{font-family:Georgia,"Times New Roman",serif;font-size:clamp(17px,4.35vw,21px);line-height:1.54;white-space:pre-line;text-shadow:0 2px 18px rgba(0,0,0,.8)}.dialogue{display:block;margin:.38em 0}.dialogue b{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;color:var(--gold);font-size:.76em;letter-spacing:.035em;text-transform:uppercase}
.nav{position:absolute;z-index:12;left:18px;right:18px;bottom:calc(12px + var(--safe));display:grid;grid-template-columns:52px 1fr 52px;align-items:center;gap:10px}.nav button{height:46px;border-radius:999px;border:1px solid var(--line);background:rgba(7,6,6,.70);color:white;font-size:24px}.nav button:disabled{opacity:.22}.count{text-align:center;font-size:10px;letter-spacing:.14em;color:#c7b9b1}.loading,.error{height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:var(--muted)}
@media(min-width:700px){.page{padding-left:54px;padding-right:54px}.nav,.chrome{left:34px;right:34px}}
</style>
</head>
<body>
<main class="reader" id="reader"><div class="loading">Загружаем рассказ…</div></main>
<script>
const root=document.getElementById('reader');let story=null,page=1,touchX=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rich(v=''){return String(v).split('\\n').map(line=>{const m=line.match(/^\\s*([А-ЯЁA-Z][А-Яа-яЁёA-Za-z-]{1,30})\\s*:\\s*(.+)$/u);return m?'<span class="dialogue"><b>'+esc(m[1])+':</b> '+esc(m[2])+'</span>':esc(line)}).join('\\n')}
function clamp(n){return Math.max(1,Math.min(story.pages.length,Number(n)||1))}
function route(n,replace=false){page=clamp(n);localStorage.setItem('night_room17_page',String(page));const u=new URL(location.href);u.searchParams.set('page',String(page));history[replace?'replaceState':'pushState']({},'',u);render()}
function render(){const p=story.pages[page-1],pct=Math.round(page/story.pages.length*100);root.innerHTML='<div class="chrome"><span>'+esc(story.novel.title)+'</span><span>'+page+' / '+story.pages.length+'</span><div class="progress"><i style="width:'+pct+'%"></i></div></div><section class="page '+(p.image?'hasImage':'')+'">'+(p.image?'<div class="media"><img src="'+esc(p.image)+'" alt="" loading="eager"></div>':'')+'<article class="copy"><div class="kicker">'+esc(p.chapter_title||('Глава '+p.chapter_no))+'</div>'+(p.page_title?'<h1 class="title">'+esc(p.page_title)+'</h1>':'')+'<div class="text">'+rich(p.body)+'</div></article></section><div class="nav"><button id="prev" '+(page<=1?'disabled':'')+'>‹</button><div class="count">СТРАНИЦА '+page+' ИЗ '+story.pages.length+'</div><button id="next" '+(page>=story.pages.length?'disabled':'')+'>›</button></div>';document.getElementById('prev').onclick=()=>route(page-1);document.getElementById('next').onclick=()=>route(page+1)}
addEventListener('popstate',()=>{const q=Number(new URL(location.href).searchParams.get('page'));page=clamp(q||1);render()});
root.addEventListener('touchstart',e=>{touchX=e.changedTouches?.[0]?.clientX||0},{passive:true});root.addEventListener('touchend',e=>{const d=(e.changedTouches?.[0]?.clientX||0)-touchX;if(Math.abs(d)>52){if(d>0&&page>1)route(page-1);if(d<0&&page<story.pages.length)route(page+1)}},{passive:true});
fetch('story.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('STORY_HTTP_'+r.status);return r.json()}).then(data=>{story=data;const q=Number(new URL(location.href).searchParams.get('page')),saved=Number(localStorage.getItem('night_room17_page'));page=clamp(q||saved||1);route(page,true)}).catch(e=>{root.innerHTML='<div class="error">Не удалось загрузить рассказ.<br>'+esc(e.message)+'</div>'});
</script>
</body></html>`;
  await fs.writeFile(path.join(outDir,'index.html'),html);

  const manifest={
    version:story.version,
    novel_id:story.novel.id,
    title:story.novel.title,
    pages:story.pages.length,
    images:story.pages.filter(x=>x.image).length,
    generated_at:story.generated_at,
    raw_messages:false
  };
  await fs.writeFile(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log('NIGHT_STATIC_READER_EXPORT_OK',JSON.stringify(manifest));
}finally{
  await pool.end().catch(()=>{});
}
