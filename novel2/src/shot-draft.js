import crypto from 'node:crypto';

// Shot Draft is an optional narrative annotation. It never advances story turns
// or calls a billable image provider.
export function sceneFingerprint(book){
  const scene=book?.current_scene||{};
  return crypto.createHash('sha256').update(JSON.stringify([
    String(book?.id||''),Number(book?.turn_no||0),
    String(scene.prose||''),scene.visual_scene||{},String(scene.visual_beat||'')
  ])).digest('hex');
}

export function narratorShotOffer(scene={}){
  const moment=String(scene?.visual_scene?.camera_moment||scene?.visual_beat||'').trim().slice(0,280);
  return moment||'Рассказчик предлагает сохранить этот момент истории как иллюстрацию.';
}

export function publicShotDraft(row){
  if(!row)return null;
  return {
    id:String(row.id),book_id:String(row.book_id),turn_no:Number(row.turn_no),
    status:String(row.status),offer:String(row.offer||''),
    frame_note:String(row.frame_note||''),revision:Number(row.revision||1),
    created_at:row.created_at,updated_at:row.updated_at
  };
}

export function normalizeFrameNote(raw){
  if(typeof raw!=='string'||raw.length>900)throw Error('NOVEL2_SHOT_NOTE_INVALID');
  const note=raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim();
  if(note.length>800)throw Error('NOVEL2_SHOT_NOTE_INVALID');
  return note;
}

export function createShotDraftStore(database, getPairKey){
  const read=async(bookId,turnNo,role)=>{
    const {rows}=await database.query(
      `SELECT s.* FROM novel2_shot_drafts s
       JOIN novel2_books b ON b.id=s.book_id
       WHERE s.book_id=$1 AND s.turn_no=$2 AND s.owner_role=$3
         AND s.pair_key=$4 AND b.pair_key=$4 AND b.status='active'
       LIMIT 1`,[bookId,turnNo,role,getPairKey()]
    );
    return rows[0]||null;
  };
  return {
    get:read,
    async save({book,role,frameNote='',revision=null,skip=false}){
      if(!book||!['A','B'].includes(role))throw Error('NOVEL2_SHOT_CONTEXT_INVALID');
      const turnNo=Number(book.turn_no),bookId=book.id;
      if(!Number.isSafeInteger(turnNo)||turnNo<0)throw Error('NOVEL2_SHOT_CONTEXT_INVALID');
      const note=normalizeFrameNote(frameNote);
      const sha=sceneFingerprint(book),offer=narratorShotOffer(book.current_scene);
      const desired=skip?'skipped':'draft';
      const pair=getPairKey();
      const {rows}=await database.query(
        `INSERT INTO novel2_shot_drafts
         (id,book_id,pair_key,turn_no,owner_role,scene_sha256,offer,frame_note,status)
         SELECT $1,b.id,b.pair_key,b.turn_no,$2,$3,$4,$5,$6
         FROM novel2_books b
         WHERE b.id=$7 AND b.pair_key=$8 AND b.turn_no=$9 AND b.status='active'
         ON CONFLICT(book_id,turn_no,owner_role) DO NOTHING
         RETURNING *`,
        [crypto.randomUUID(),role,sha,offer,note,desired,bookId,pair,turnNo]
      );
      if(rows[0])return rows[0];
      const prev=await read(bookId,turnNo,role);
      if(!prev)throw Error('NOVEL2_SHOT_SCENE_STALE');
      if(prev.scene_sha256!==sha)throw Error('NOVEL2_SHOT_SCENE_STALE');
      if(prev.status===desired&&(skip||prev.frame_note===note))return prev; // retry is read-only
      if(prev.status!=='draft')throw Error('NOVEL2_SHOT_ALREADY_FINALIZED');
      if(!Number.isSafeInteger(revision)||revision!==Number(prev.revision))
        throw Error('NOVEL2_SHOT_REVISION_CONFLICT');
      const updated=await database.query(
        `UPDATE novel2_shot_drafts s
         SET status=$1,frame_note=$2,revision=revision+1,updated_at=now()
         WHERE s.id=$3 AND s.pair_key=$4 AND s.scene_sha256=$5
           AND s.revision=$6 AND s.status='draft'
           AND EXISTS(SELECT 1 FROM novel2_books b
                      WHERE b.id=s.book_id AND b.pair_key=$4
                        AND b.turn_no=s.turn_no AND b.status='active')
         RETURNING s.*`,
        [desired,note,prev.id,pair,sha,revision]
      );
      if(!updated.rows[0])throw Error('NOVEL2_SHOT_REVISION_CONFLICT');
      return updated.rows[0];
    }
  };
}
