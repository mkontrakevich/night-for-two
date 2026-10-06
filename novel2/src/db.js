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
