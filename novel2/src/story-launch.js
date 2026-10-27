const schema=`CREATE TABLE IF NOT EXISTS novel2_story_launch_jobs(
  pair_key text NOT NULL, draft_id bigint NOT NULL, role text NOT NULL,
  status text NOT NULL, stage text NOT NULL DEFAULT 'queued',
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb, book_id bigint,
  error_code text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(pair_key,draft_id)
);`;

export function launchFailureCode(error){
  // Preserve a useful diagnostic category without retaining provider bodies,
  // prompts, credentials, character data or arbitrary exception messages.
  const known=String(error?.message||'').match(/^(NOVEL2_[A-Z0-9_]{1,100})(?=:|$)/);
  return known?.[1]||'NOVEL2_LAUNCH_STEP_FAILED';
}

export function publicLaunchJob(row){
  if(!row)return null;
  return {draft_id:String(row.draft_id),status:row.status,stage:row.stage,
    book_id:row.book_id?String(row.book_id):null,error_code:row.error_code||'',
    updated_at:row.updated_at,
    stalled:row.status==='working'&&Date.now()-new Date(row.updated_at).getTime()>90000};
}

// The pair-wide session lock belongs to a dedicated DB connection. A second
// process/tab cannot replay generation, and a process exit releases the lock.
// Failed/interrupted work is resumed only by an explicit user action.
export function createStoryLaunchQueue({db,pairKey,execute,validate}){
  const tasks=new Set();
  const pair=()=>String(pairKey());
  const lock=()=>`novel2-story-launch:${pair()}`;
  async function init(){await db.query(schema);}
  async function get(role,draftId){
    const {rows}=await db.query('SELECT * FROM novel2_story_launch_jobs WHERE pair_key=$1 AND draft_id=$2 AND role=$3',[pair(),draftId,role]);
    return rows[0]||null;
  }
  async function latest(role){
    const {rows}=await db.query("SELECT * FROM novel2_story_launch_jobs WHERE pair_key=$1 AND role=$2 AND status<>'ready' ORDER BY updated_at DESC LIMIT 1",[pair(),role]);
    return rows[0]||null;
  }
  async function start(role,draftId,{resume=false}={}){
    if(!['A','B'].includes(role)||!/^\d+$/.test(String(draftId)))throw new Error('NOVEL2_LAUNCH_INPUT_INVALID');
    const previous=await get(role,draftId);
    if(previous&&(!resume||previous.status==='ready'))return publicLaunchJob(previous);
    const client=await db.connect();let locked=false,transferred=false;
    try{
      const attempt=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[lock()]);
      locked=attempt.rows[0]?.locked===true;
      if(!locked){
        const existing=await get(role,draftId);
        if(existing)return publicLaunchJob(existing);
        throw new Error('NOVEL2_LAUNCH_ALREADY_RUNNING');
      }
      // Re-read after locking: concurrent duplicate requests may have completed.
      const current=await get(role,draftId);
      if(current&&(!resume||current.status==='ready'))return publicLaunchJob(current);
      await validate(role,draftId);
      const {rows}=await client.query(`INSERT INTO novel2_story_launch_jobs(pair_key,draft_id,role,status)
        VALUES($1,$2,$3,'working') ON CONFLICT(pair_key,draft_id) DO UPDATE
        SET status='working',error_code='',updated_at=now()
        WHERE novel2_story_launch_jobs.role=EXCLUDED.role RETURNING *`,[pair(),draftId,role]);
      if(!rows[0])throw new Error('NOVEL2_LAUNCH_ROLE_MISMATCH');
      let checkpoint=rows[0].checkpoint||{};
      const save=async(stage,patch={})=>{
        checkpoint={...checkpoint,...patch};
        await client.query(`UPDATE novel2_story_launch_jobs SET stage=$4,checkpoint=$5::jsonb,updated_at=now()
          WHERE pair_key=$1 AND draft_id=$2 AND role=$3`,[pair(),draftId,role,stage,JSON.stringify(checkpoint)]);
      };
      const run=async()=>{
        const heartbeat=setInterval(()=>{client.query("UPDATE novel2_story_launch_jobs SET updated_at=now() WHERE pair_key=$1 AND draft_id=$2 AND status='working'",[pair(),draftId]).catch(()=>{});},15000);
        heartbeat.unref?.();
        try{
          // Publication sets the book ID and ready state in its own transaction.
          await execute({role,draftId,checkpoint,save,client});
        }catch(error){
          const code=launchFailureCode(error);
          console.error('NOVEL2_STORY_LAUNCH_FAILED',{draft_id:String(draftId),code});
          await client.query("UPDATE novel2_story_launch_jobs SET status='failed',error_code=$3,updated_at=now() WHERE pair_key=$1 AND draft_id=$2 AND status<>'ready'",[pair(),draftId,code]).catch(()=>{});
        }finally{
          clearInterval(heartbeat);
          await client.query('SELECT pg_advisory_unlock(hashtext($1))',[lock()]).catch(()=>{});
          client.release();
        }
      };
      transferred=true;
      const task=Promise.resolve().then(run);tasks.add(task);
      void task.finally(()=>tasks.delete(task));
      return publicLaunchJob(rows[0]);
    }finally{
      if(!transferred){if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',[lock()]).catch(()=>{});client.release();}
    }
  }
  return {init,get,latest,start,drain:()=>Promise.all([...tasks])};
}

// Book, first scene, cast, consumed draft and ready job are one atomic commit.
// A crash before COMMIT leaves the previous book and draft untouched.
export async function publishStoryLaunch(client,{pair,draftId,bible,castEntries,assignments}){
  await client.query('BEGIN');
  try{
    const {rows:jobs}=await client.query('SELECT book_id FROM novel2_story_launch_jobs WHERE pair_key=$1 AND draft_id=$2 FOR UPDATE',[pair,draftId]);
    if(jobs[0]?.book_id){await client.query('COMMIT');return jobs[0].book_id;}
    const draft=await client.query("SELECT id FROM novel2_story_drafts WHERE pair_key=$1 AND id=$2 AND status='draft' FOR UPDATE",[pair,draftId]);
    if(!draft.rows.length)throw new Error('NOVEL2_STORY_DRAFT_NOT_FOUND');
    await client.query("UPDATE novel2_books SET status='archived',canon=jsonb_set(COALESCE(canon,'{}'::jsonb),'{exit_reason}',to_jsonb('new_book'::text),true),updated_at=now() WHERE pair_key=$1 AND status='active'",[pair]);
    const scene=bible.first_scene||{};
    const {rows}=await client.query(`INSERT INTO novel2_books(pair_key,title,story_bible,canon,current_scene,active_role,turn_no)
      VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,1) RETURNING id`,[pair,bible.title||'',JSON.stringify(bible),JSON.stringify(bible.canon||{}),JSON.stringify(scene),scene.target_role]);
    const bookId=rows[0].id;
    await client.query("INSERT INTO novel2_turns(book_id,turn_no,role,kind,content,payload) VALUES($1,1,'AI','scene',$2,$3::jsonb)",[bookId,String(scene.prose||''),JSON.stringify(scene)]);
    for(const entry of castEntries){
      await client.query(`INSERT INTO novel2_book_cast(book_id,slot_key,narrative_function,source_type,source_id,interactive_role,
        display_name,character_card,visual_profile,identity_lock,reference_images,control_mode)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)`,[
        bookId,String(entry.slot_key||'').slice(0,60),String(entry.narrative_function||'').slice(0,500),entry.source_type,
        String(entry.source_id||''),entry.interactive_role||null,String(entry.display_name||'').slice(0,120),
        JSON.stringify(entry.character_card||{}),JSON.stringify(entry.visual_profile||{}),entry.identity_lock||'',JSON.stringify(entry.reference_images||[]),entry.control_mode==='human'?'human':'ai']);
    }
    await client.query("UPDATE novel2_story_drafts SET status='used',cast_config=$3::jsonb,updated_at=now() WHERE pair_key=$1 AND id=$2",[pair,draftId,JSON.stringify(assignments)]);
    await client.query("UPDATE novel2_story_launch_jobs SET status='ready',stage='ready',book_id=$3,error_code='',checkpoint='{}'::jsonb,updated_at=now() WHERE pair_key=$1 AND draft_id=$2",[pair,draftId,bookId]);
    await client.query('COMMIT');return bookId;
  }catch(error){await client.query('ROLLBACK');throw error;}
}

