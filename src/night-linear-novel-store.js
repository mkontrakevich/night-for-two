const SCHEMA=`
CREATE TABLE IF NOT EXISTS night_linear_novels(
  id bigserial PRIMARY KEY,
  book_seed text NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','illustrating','complete','failed')),
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_pages integer NOT NULL DEFAULT 100,
  generated_pages integer NOT NULL DEFAULT 0,
  generated_images integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS night_linear_novels_status_idx ON night_linear_novels(status,created_at DESC);

CREATE TABLE IF NOT EXISTS night_linear_novel_pages(
  novel_id bigint NOT NULL REFERENCES night_linear_novels(id) ON DELETE CASCADE,
  page_no integer NOT NULL CHECK(page_no>=1),
  chapter_no integer NOT NULL CHECK(chapter_no>=1),
  chapter_title text NOT NULL DEFAULT '',
  page_title text NOT NULL DEFAULT '',
  body text NOT NULL,
  media_prompt text NOT NULL DEFAULT '',
  visual_key text NOT NULL DEFAULT '',
  image_status text NOT NULL DEFAULT 'planned' CHECK(image_status IN ('planned','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(novel_id,page_no)
);
CREATE INDEX IF NOT EXISTS night_linear_novel_pages_chapter_idx ON night_linear_novel_pages(novel_id,chapter_no,page_no);
`;

function int(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback;}

export function createNightLinearNovelStore({pool}={}){
  if(!pool?.query)throw new Error('NIGHT_LINEAR_NOVEL_POOL_REQUIRED');
  async function init(){await pool.query(SCHEMA);return true;}
  async function create({bookSeed,title='',plan={},totalPages=100}={}){
    await init();
    const {rows}=await pool.query(
      `INSERT INTO night_linear_novels(book_seed,title,status,plan,total_pages) VALUES($1,$2,'generating',$3::jsonb,$4) RETURNING *`,
      [String(bookSeed||''),String(title||'').slice(0,240),JSON.stringify(plan||{}),int(totalPages,1,1000,100)]
    );
    return rows[0];
  }
  async function updateNovel(id,patch={}){
    const current=await get(id);if(!current)throw new Error('NIGHT_LINEAR_NOVEL_NOT_FOUND');
    const status=['generating','illustrating','complete','failed'].includes(String(patch.status))?String(patch.status):current.status;
    const title=patch.title===undefined?current.title:String(patch.title||'').slice(0,240);
    const generatedPages=patch.generated_pages===undefined?current.generated_pages:int(patch.generated_pages,0,current.total_pages,current.generated_pages);
    const generatedImages=patch.generated_images===undefined?current.generated_images:int(patch.generated_images,0,current.total_pages,current.generated_images);
    const error=patch.error===undefined?current.error:String(patch.error||'').slice(0,1600);
    const plan=patch.plan===undefined?current.plan:patch.plan;
    const completed=status==='complete';
    const {rows}=await pool.query(
      `UPDATE night_linear_novels SET title=$2,status=$3,plan=$4::jsonb,generated_pages=$5,generated_images=$6,error=$7,completed_at=CASE WHEN $8 THEN COALESCE(completed_at,now()) ELSE completed_at END,updated_at=now() WHERE id=$1 RETURNING *`,
      [Number(id),title,status,JSON.stringify(plan||{}),generatedPages,generatedImages,error,completed]
    );
    return rows[0];
  }
  async function get(id){await init();const {rows}=await pool.query('SELECT * FROM night_linear_novels WHERE id=$1',[Number(id)]);return rows[0]||null;}
  async function latest(){
    await init();
    const {rows}=await pool.query(`SELECT * FROM night_linear_novels ORDER BY created_at DESC,id DESC LIMIT 1`);
    return rows[0]||null;
  }
  async function latestComplete(){await init();const {rows}=await pool.query(`SELECT * FROM night_linear_novels WHERE status='complete' ORDER BY completed_at DESC NULLS LAST,id DESC LIMIT 1`);return rows[0]||null;}
  async function upsertPage(novelId,page={}){
    await init();
    const {rows}=await pool.query(
      `INSERT INTO night_linear_novel_pages(novel_id,page_no,chapter_no,chapter_title,page_title,body,media_prompt,visual_key,image_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(novel_id,page_no) DO UPDATE SET chapter_no=EXCLUDED.chapter_no,chapter_title=EXCLUDED.chapter_title,page_title=EXCLUDED.page_title,body=EXCLUDED.body,media_prompt=EXCLUDED.media_prompt,visual_key=EXCLUDED.visual_key,image_status=EXCLUDED.image_status,updated_at=now()
       RETURNING *`,
      [Number(novelId),int(page.page_no,1,1000,1),int(page.chapter_no,1,100,1),String(page.chapter_title||'').slice(0,240),String(page.page_title||'').slice(0,240),String(page.body||''),String(page.media_prompt||'').slice(0,1200),String(page.visual_key||'').slice(0,180),['planned','ready','failed'].includes(String(page.image_status))?String(page.image_status):'planned']
    );
    return rows[0];
  }
  async function markImage(novelId,pageNo,status='ready'){
    await init();
    const imageStatus=['planned','ready','failed'].includes(String(status))?String(status):'planned';
    const {rows}=await pool.query(`UPDATE night_linear_novel_pages SET image_status=$3,updated_at=now() WHERE novel_id=$1 AND page_no=$2 RETURNING *`,[Number(novelId),Number(pageNo),imageStatus]);
    return rows[0]||null;
  }
  async function page(novelId,pageNo){
    await init();
    const novel=await get(novelId);if(!novel)return null;
    const p=int(pageNo,1,novel.total_pages,1);
    const {rows}=await pool.query('SELECT * FROM night_linear_novel_pages WHERE novel_id=$1 AND page_no=$2',[Number(novelId),p]);
    return rows[0]||null;
  }
  async function imageStats(novelId){
    await init();
    const {rows}=await pool.query(`SELECT COUNT(*) FILTER (WHERE BTRIM(media_prompt)<>'')::int AS planned,COUNT(*) FILTER (WHERE BTRIM(media_prompt)<>'' AND image_status='ready')::int AS ready FROM night_linear_novel_pages WHERE novel_id=$1`,[Number(novelId)]);
    return {planned:Number(rows[0]?.planned)||0,ready:Number(rows[0]?.ready)||0};
  }
  async function readerState(pageNo=1){
    const novel=await latestComplete();
    if(!novel){
      const progress=await latest();
      if(!progress)return {mode:'linear_novel_unavailable',novel:null};
      const stats=await imageStats(progress.id);
      return {mode:'linear_novel_unavailable',novel:{id:progress.id,title:progress.title,status:progress.status,total_pages:progress.total_pages,generated_pages:progress.generated_pages,generated_images:stats.ready,planned_images:stats.planned,error:progress.error}};
    }
    const stats=await imageStats(novel.id);
    const p=await page(novel.id,pageNo);
    if(!p)throw new Error('NIGHT_LINEAR_NOVEL_PAGE_NOT_FOUND');
    return {mode:'linear_novel',novel:{id:novel.id,title:novel.title,status:novel.status,total_pages:novel.total_pages,generated_pages:novel.generated_pages,generated_images:stats.ready,planned_images:stats.planned},page:p,ui_theme:'boudoir'};
  }
  async function status(){
    const novel=await latest();
    if(!novel)return {status:'missing',progress:0,total_pages:100,generated_pages:0,generated_images:0,planned_images:0,complete:false};
    const stats=await imageStats(novel.id),textRatio=Math.min(1,(Number(novel.generated_pages)||0)/Math.max(1,Number(novel.total_pages)||100)),visualRatio=stats.planned?Math.min(1,stats.ready/stats.planned):(novel.status==='generating'?0:1);
    const complete=novel.status==='complete'&&novel.generated_pages>=novel.total_pages&&stats.planned>0&&stats.ready>=stats.planned;
    const progress=complete?100:Math.floor(Math.min(99,textRatio*75+visualRatio*25));
    return {id:novel.id,title:novel.title,status:novel.status,progress,total_pages:novel.total_pages,generated_pages:novel.generated_pages,generated_images:stats.ready,planned_images:stats.planned,error:novel.error,complete};
  }
  return {init,create,updateNovel,get,latest,latestComplete,upsertPage,markImage,page,imageStats,readerState,status};
}
