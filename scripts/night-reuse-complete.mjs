import pg from 'pg';

const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
const afterRaw=process.argv.find(x=>x.startsWith('--after='))?.slice('--after='.length)||'';
const after=afterRaw?new Date(afterRaw):null;
if(!afterRaw||Number.isNaN(after?.getTime()))throw new Error('NIGHT_REUSE_AFTER_INVALID');

const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
  const {rows}=await pool.query(`
    SELECT id,title,completed_at,total_pages,generated_pages,generated_images
    FROM night_linear_novels
    WHERE status='complete'
    ORDER BY completed_at DESC NULLS LAST,id DESC
    LIMIT 1
  `);
  const novel=rows[0]||null;
  const completed=novel?.completed_at?new Date(novel.completed_at):null;
  const reusable=Boolean(completed&&!Number.isNaN(completed.getTime())&&completed.getTime()>=after.getTime());
  console.log('NIGHT_REUSE_COMPLETE '+JSON.stringify({
    reusable,
    requested_after:after.toISOString(),
    novel:novel?{
      id:Number(novel.id),
      title:String(novel.title||''),
      completed_at:completed?.toISOString()||null,
      total_pages:Number(novel.total_pages)||0,
      generated_pages:Number(novel.generated_pages)||0,
      generated_images:Number(novel.generated_images)||0
    }:null
  }));
  if(!reusable)process.exitCode=3;
}finally{
  await pool.end().catch(()=>{});
}
