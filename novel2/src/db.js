import pg from 'pg';
import {config} from './config.js';

const {Pool} = pg;
export const db = new Pool(config.databaseUrl ? {
  connectionString: config.databaseUrl,
  max: 6,
  ssl: /sslmode=require/i.test(config.databaseUrl) ? {rejectUnauthorized:false} : undefined
} : {});

const schema = `
CREATE TABLE IF NOT EXISTS novel2_books(
  id bigserial PRIMARY KEY,
  pair_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','finished','archived')),
  title text NOT NULL DEFAULT '',
  story_bible jsonb NOT NULL DEFAULT '{}'::jsonb,
  canon jsonb NOT NULL DEFAULT '{}'::jsonb,
  chapter_no integer NOT NULL DEFAULT 1,
  turn_no integer NOT NULL DEFAULT 0,
  active_role text NOT NULL DEFAULT 'A' CHECK(active_role IN ('A','B')),
  current_scene jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS novel2_books_pair_idx ON novel2_books(pair_key,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS novel2_turns(
  id bigserial PRIMARY KEY,
  book_id bigint NOT NULL REFERENCES novel2_books(id) ON DELETE CASCADE,
  turn_no integer NOT NULL,
  role text NOT NULL CHECK(role IN ('A','B','AI')),
  kind text NOT NULL CHECK(kind IN ('scene','reply','action','system')),
  content text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id,turn_no,role,kind)
);
CREATE INDEX IF NOT EXISTS novel2_turns_book_idx ON novel2_turns(book_id,turn_no DESC);

CREATE TABLE IF NOT EXISTS novel2_identity(
  pair_key text NOT NULL,
  role text NOT NULL CHECK(role IN ('A','B')),
  version integer NOT NULL DEFAULT 1,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  character_card jsonb NOT NULL DEFAULT '{}'::jsonb,
  builder_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity_lock text NOT NULL DEFAULT '',
  reference_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(pair_key,role)
);
ALTER TABLE novel2_identity ADD COLUMN IF NOT EXISTS character_card jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE novel2_identity ADD COLUMN IF NOT EXISTS builder_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS novel2_ai_characters(
  id text PRIMARY KEY,
  name text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  character_card jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity_lock text NOT NULL DEFAULT '',
  reference_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'preset',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS novel2_story_drafts(
  id bigserial PRIMARY KEY,
  pair_key text NOT NULL,
  title text NOT NULL DEFAULT '',
  logline text NOT NULL DEFAULT '',
  blueprint jsonb NOT NULL DEFAULT '{}'::jsonb,
  cast_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','used','discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS novel2_story_drafts_pair_idx ON novel2_story_drafts(pair_key,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS novel2_book_cast(
  book_id bigint NOT NULL REFERENCES novel2_books(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  narrative_function text NOT NULL DEFAULT '',
  source_type text NOT NULL CHECK(source_type IN ('player','ai_library')),
  source_id text NOT NULL,
  interactive_role text CHECK(interactive_role IN ('A','B') OR interactive_role IS NULL),
  display_name text NOT NULL DEFAULT '',
  character_card jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity_lock text NOT NULL DEFAULT '',
  reference_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  control_mode text NOT NULL DEFAULT 'ai' CHECK(control_mode IN ('human','ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(book_id,slot_key)
);
CREATE INDEX IF NOT EXISTS novel2_book_cast_book_idx ON novel2_book_cast(book_id);

CREATE TABLE IF NOT EXISTS novel2_visuals(
  id bigserial PRIMARY KEY,
  book_id bigint NOT NULL REFERENCES novel2_books(id) ON DELETE CASCADE,
  turn_no integer NOT NULL,
  visual_key text NOT NULL,
  prompt text NOT NULL,
  model text NOT NULL DEFAULT '',
  image_base64 text NOT NULL DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id,visual_key)
);
`;

export async function initDb() {
  if (!config.databaseUrl && config.localTest) return;
  await db.query(schema);
}

export function pairKey() {
  return [config.ownerId || 'local_a', config.partnerId || 'local_b'].sort().join(':');
}

export async function latestBook() {
  const {rows} = await db.query(
    `SELECT * FROM novel2_books WHERE pair_key=$1 AND status='active' ORDER BY updated_at DESC LIMIT 1`,
    [pairKey()]
  );
  return rows[0] || null;
}

export async function listBooks(limit=12) {
  const {rows}=await db.query(
    `SELECT id,title,status,chapter_no,turn_no,active_role,
            COALESCE(story_bible->>'logline','') AS logline,
            created_at,updated_at
       FROM novel2_books
      WHERE pair_key=$1
      ORDER BY (status='active') DESC, updated_at DESC
      LIMIT $2`,
    [pairKey(), Math.max(1,Math.min(50,Number(limit)||12))]
  );
  return rows;
}

export async function renameBook(bookId,title='') {
  const clean=String(title||'').trim().slice(0,140);
  if(!clean) throw new Error('NOVEL2_BOOK_TITLE_REQUIRED');
  const {rows}=await db.query(
    `UPDATE novel2_books SET title=$2,updated_at=now()
      WHERE id=$1 AND pair_key=$3
      RETURNING id,title,status,chapter_no,turn_no,updated_at`,
    [bookId,clean,pairKey()]
  );
  return rows[0]||null;
}

export async function deleteBook(bookId) {
  const {rows}=await db.query(
    `DELETE FROM novel2_books WHERE id=$1 AND pair_key=$2 RETURNING id,title,status`,
    [bookId,pairKey()]
  );
  return rows[0]||null;
}

export async function activateBook(bookId) {
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await client.query(
      `UPDATE novel2_books SET status='archived',updated_at=now()
        WHERE pair_key=$1 AND status='active' AND id<>$2`,
      [pairKey(),bookId]
    );
    const {rows}=await client.query(
      `UPDATE novel2_books SET status='active',updated_at=now()
        WHERE id=$1 AND pair_key=$2
        RETURNING *`,
      [bookId,pairKey()]
    );
    await client.query('COMMIT');
    return rows[0]||null;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release();}
}

export async function upsertAiCharacter({id,name,tags=[],characterCard={},visualProfile={},identityLock='',referenceImages=[],source='preset',enabled=true}) {
  const {rows}=await db.query(
    `INSERT INTO novel2_ai_characters(id,name,tags,character_card,visual_profile,identity_lock,reference_images,source,enabled)
     VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9)
     ON CONFLICT(id) DO UPDATE SET
       name=EXCLUDED.name,
       tags=EXCLUDED.tags,
       character_card=EXCLUDED.character_card,
       visual_profile=EXCLUDED.visual_profile,
       identity_lock=EXCLUDED.identity_lock,
       reference_images=CASE WHEN novel2_ai_characters.reference_images='[]'::jsonb THEN EXCLUDED.reference_images ELSE novel2_ai_characters.reference_images END,
       source=EXCLUDED.source,
       enabled=EXCLUDED.enabled,
       updated_at=now()
     RETURNING *`,
    [id,name,JSON.stringify(tags),JSON.stringify(characterCard),JSON.stringify(visualProfile),identityLock,JSON.stringify(referenceImages),source,Boolean(enabled)]
  );
  return rows[0];
}

export async function listAiCharacters() {
  const {rows}=await db.query(
    `SELECT id,name,tags,character_card,visual_profile,identity_lock,reference_images,source
       FROM novel2_ai_characters
      WHERE enabled=true
      ORDER BY name`
  );
  return rows;
}

export async function getAiCharacter(id) {
  const {rows}=await db.query(
    `SELECT * FROM novel2_ai_characters WHERE id=$1 AND enabled=true LIMIT 1`,
    [String(id||'')]
  );
  return rows[0]||null;
}

export async function saveAiCharacterReference(id,referenceData) {
  const {rows}=await db.query(
    `UPDATE novel2_ai_characters
        SET reference_images=$2::jsonb,updated_at=now()
      WHERE id=$1
      RETURNING *`,
    [id,JSON.stringify(referenceData?[referenceData]:[])]
  );
  return rows[0]||null;
}

export async function createStoryDraft({title='',logline='',blueprint={}}) {
  const {rows}=await db.query(
    `INSERT INTO novel2_story_drafts(pair_key,title,logline,blueprint)
     VALUES($1,$2,$3,$4::jsonb)
     RETURNING *`,
    [pairKey(),String(title||'').slice(0,140),String(logline||'').slice(0,900),JSON.stringify(blueprint)]
  );
  return rows[0];
}

export async function getStoryDraft(id) {
  const {rows}=await db.query(
    `SELECT * FROM novel2_story_drafts WHERE id=$1 AND pair_key=$2 AND status='draft' LIMIT 1`,
    [id,pairKey()]
  );
  return rows[0]||null;
}

export async function listStoryDrafts(limit=8) {
  const {rows}=await db.query(
    `SELECT id,title,logline,blueprint,cast_config,status,created_at,updated_at
       FROM novel2_story_drafts
      WHERE pair_key=$1 AND status='draft'
      ORDER BY updated_at DESC LIMIT $2`,
    [pairKey(),Math.max(1,Math.min(20,Number(limit)||8))]
  );
  return rows;
}

export async function markStoryDraftUsed(id,castConfig={}) {
  const {rows}=await db.query(
    `UPDATE novel2_story_drafts
        SET status='used',cast_config=$2::jsonb,updated_at=now()
      WHERE id=$1 AND pair_key=$3 AND status='draft'
      RETURNING *`,
    [id,JSON.stringify(castConfig),pairKey()]
  );
  return rows[0]||null;
}

export async function saveBookCast(bookId,entries=[]) {
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM novel2_book_cast WHERE book_id=$1',[bookId]);
    for(const entry of entries){
      await client.query(
        `INSERT INTO novel2_book_cast(
           book_id,slot_key,narrative_function,source_type,source_id,interactive_role,
           display_name,character_card,visual_profile,identity_lock,reference_images,control_mode
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)`,
        [
          bookId,String(entry.slot_key||'').slice(0,60),String(entry.narrative_function||'').slice(0,500),
          entry.source_type,String(entry.source_id||''),entry.interactive_role||null,
          String(entry.display_name||'').slice(0,120),JSON.stringify(entry.character_card||{}),
          JSON.stringify(entry.visual_profile||{}),String(entry.identity_lock||''),
          JSON.stringify(entry.reference_images||[]),entry.control_mode==='human'?'human':'ai'
        ]
      );
    }
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release();}
}

export async function getBookCast(bookId) {
  const {rows}=await db.query(
    `SELECT * FROM novel2_book_cast WHERE book_id=$1 ORDER BY slot_key`,
    [bookId]
  );
  return rows;
}

export async function createBook({title='', storyBible={}, scene={}, activeRole='A'}) {
  const {rows} = await db.query(
    `INSERT INTO novel2_books(pair_key,title,story_bible,canon,current_scene,active_role,turn_no)
     VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,1) RETURNING *`,
    [pairKey(), title, JSON.stringify(storyBible), JSON.stringify(storyBible?.canon || {}), JSON.stringify(scene), activeRole]
  );
  const book = rows[0];
  await appendTurn(book.id, 1, 'AI', 'scene', String(scene?.prose || ''), scene);
  return book;
}

export async function appendTurn(bookId, turnNo, role, kind, content, payload={}) {
  await db.query(
    `INSERT INTO novel2_turns(book_id,turn_no,role,kind,content,payload)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT(book_id,turn_no,role,kind) DO UPDATE SET content=EXCLUDED.content,payload=EXCLUDED.payload`,
    [bookId, turnNo, role, kind, String(content || ''), JSON.stringify(payload || {})]
  );
}

export async function recentTurns(bookId, limit=16) {
  const {rows} = await db.query(
    `SELECT turn_no,role,kind,content,payload FROM novel2_turns WHERE book_id=$1 ORDER BY turn_no DESC,id DESC LIMIT $2`,
    [bookId, Math.max(1, Math.min(40, Number(limit)||16))]
  );
  return rows.reverse();
}

export async function advanceBook(book, {scene, canon={}, activeRole}) {
  const nextTurn = Number(book.turn_no || 0) + 1;
  const {rows} = await db.query(
    `UPDATE novel2_books
       SET current_scene=$2::jsonb,canon=$3::jsonb,active_role=$4,turn_no=$5,
           chapter_no=GREATEST(chapter_no,$6),updated_at=now()
     WHERE id=$1 RETURNING *`,
    [book.id, JSON.stringify(scene), JSON.stringify(canon), activeRole, nextTurn, Number(scene?.chapter_no || book.chapter_no || 1)]
  );
  await appendTurn(book.id, nextTurn, 'AI', 'scene', String(scene?.prose || ''), scene);
  return rows[0];
}

export async function archiveBook(bookId, reason='user_exit') {
  const {rows}=await db.query(
    `UPDATE novel2_books
       SET status='archived',
           canon=jsonb_set(COALESCE(canon,'{}'::jsonb),'{exit_reason}',to_jsonb($2::text),true),
           updated_at=now()
     WHERE id=$1 AND pair_key=$3 AND status='active'
     RETURNING *`,
    [bookId, String(reason||'user_exit').slice(0,80), pairKey()]
  );
  return rows[0]||null;
}

export async function saveIdentity(role, {profile={}, characterCard={}, builderMeta={}, identityLock='', referenceImages=[], approved=false}) {
  const key = pairKey();
  const {rows} = await db.query(
    `INSERT INTO novel2_identity(pair_key,role,profile,character_card,builder_meta,identity_lock,reference_images,approved)
     VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8)
     ON CONFLICT(pair_key,role) DO UPDATE SET
       version=novel2_identity.version+1,
       profile=EXCLUDED.profile,
       character_card=CASE WHEN EXCLUDED.character_card='{}'::jsonb THEN novel2_identity.character_card ELSE EXCLUDED.character_card END,
       builder_meta=CASE WHEN EXCLUDED.builder_meta='{}'::jsonb THEN novel2_identity.builder_meta ELSE EXCLUDED.builder_meta END,
       identity_lock=EXCLUDED.identity_lock,
       reference_images=EXCLUDED.reference_images,
       approved=EXCLUDED.approved,
       updated_at=now()
     RETURNING *`,
    [key, role, JSON.stringify(profile), JSON.stringify(characterCard), JSON.stringify(builderMeta), String(identityLock||''), JSON.stringify(referenceImages), Boolean(approved)]
  );
  return rows[0];
}

export async function approveIdentity(role) {
  const {rows}=await db.query(
    `UPDATE novel2_identity SET approved=true,updated_at=now()
       WHERE pair_key=$1 AND role=$2 AND character_card <> '{}'::jsonb
       RETURNING *`,
    [pairKey(), role]
  );
  if(!rows[0]) throw new Error('NOVEL2_CHARACTER_CARD_REQUIRED');
  return rows[0];
}

export async function identities() {
  const {rows} = await db.query(`SELECT role,version,profile,character_card,builder_meta,identity_lock,reference_images,approved FROM novel2_identity WHERE pair_key=$1 ORDER BY role`, [pairKey()]);
  return Object.fromEntries(rows.map(x=>[x.role,x]));
}


export async function getVisual(bookId, visualKey) {
  const {rows}=await db.query(
    `SELECT * FROM novel2_visuals WHERE book_id=$1 AND visual_key=$2 LIMIT 1`,
    [bookId, visualKey]
  );
  return rows[0]||null;
}

export async function previousVisual(bookId, turnNo) {
  const {rows}=await db.query(
    `SELECT * FROM novel2_visuals WHERE book_id=$1 AND turn_no<$2 ORDER BY turn_no DESC,id DESC LIMIT 1`,
    [bookId, turnNo]
  );
  return rows[0]||null;
}

export async function saveVisual({bookId,turnNo,visualKey,prompt,model,imageBase64,meta={}}) {
  const {rows}=await db.query(
    `INSERT INTO novel2_visuals(book_id,turn_no,visual_key,prompt,model,image_base64,meta)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT(book_id,visual_key) DO UPDATE SET
       prompt=EXCLUDED.prompt,model=EXCLUDED.model,image_base64=EXCLUDED.image_base64,meta=EXCLUDED.meta
     RETURNING *`,
    [bookId,turnNo,visualKey,prompt,model,imageBase64,JSON.stringify(meta)]
  );
  return rows[0];
}


export async function claimSyntheticControl(role) {
  const {rows}=await db.query(
    `UPDATE novel2_identity
       SET builder_meta=jsonb_set(
             jsonb_set(builder_meta,'{control_mode}','"human"'::jsonb,true),
             '{claimed_at}',to_jsonb(now()::text),true
           ),
           updated_at=now()
       WHERE pair_key=$1
         AND role=$2
         AND builder_meta->>'synthetic'='true'
         AND builder_meta->>'control_mode'='ai'
       RETURNING *`,
    [pairKey(),role]
  );
  return rows[0]||null;
}


export async function claimBookCastControl(bookId,role) {
  const {rows}=await db.query(
    `UPDATE novel2_book_cast
        SET control_mode='human'
      WHERE book_id=$1 AND interactive_role=$2 AND control_mode='ai'
      RETURNING *`,
    [bookId,role]
  );
  return rows[0]||null;
}


export async function updateBookCastReference(bookId,slotKey,referenceImages=[]) {
  const {rows}=await db.query(
    `UPDATE novel2_book_cast
        SET reference_images=$3::jsonb
      WHERE book_id=$1 AND slot_key=$2
      RETURNING *`,
    [bookId,String(slotKey||''),JSON.stringify(referenceImages)]
  );
  return rows[0]||null;
}
