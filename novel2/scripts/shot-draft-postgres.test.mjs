import assert from 'node:assert/strict';
const url=process.env.NOVEL2_LAUNCH_TEST_DATABASE_URL;
if(!url)throw Error('NOVEL2_SHOT_TEST_DATABASE_REQUIRED');
process.env.DATABASE_URL=url;
process.env.NOVEL2_LOCAL_TEST_MODE='1';
const {db,initDb,pairKey}=await import('../src/db.js');
const {createShotDraftStore,sceneFingerprint}=await import('../src/shot-draft.js');
await initDb();
const store=createShotDraftStore(db,pairKey);
const scene={prose:'Два вымышленных взрослых героя разговаривают у окна.',visual_scene:{camera_moment:'Крупный план рук.'}};
const {rows}=await db.query(
 "INSERT INTO novel2_books(pair_key,title,turn_no,current_scene) VALUES($1,'Shot smoke',7,$2::jsonb) RETURNING *",
 [pairKey(),JSON.stringify(scene)]
);
const book=rows[0];
try{
 const first=await store.save({book,role:'A',frameNote:'Мягкий свет'});
 assert.equal(first.status,'draft');
 assert.equal(first.revision,1);
 assert.equal(first.scene_sha256,sceneFingerprint(book));
 assert.equal(first.frame_note,'Мягкий свет');
 const retry=await store.save({book,role:'A',frameNote:'Мягкий свет'});
 assert.equal(retry.id,first.id);
 assert.equal(retry.revision,1);
 assert.equal(await store.get(book.id,7,'B'),null,'Player B must not see player A draft');
 const second=await store.save({book,role:'A',frameNote:'Средний план, натуральный свет',revision:1});
 assert.equal(second.id,first.id);
 assert.equal(second.revision,2);
 await assert.rejects(()=>store.save({book,role:'A',frameNote:'stale edit',revision:1}),/REVISION_CONFLICT/);
 const other=await store.save({book,role:'B',frameNote:'Общий план'});
 assert.notEqual(other.id,first.id);
 assert.equal(other.owner_role,'B');
 const skipped=await store.save({book,role:'A',skip:true,revision:2});
 assert.equal(skipped.status,'skipped');
 assert.equal((await store.save({book,role:'A',skip:true})).revision,3,'Repeat skip is idempotent');
 await assert.rejects(()=>store.save({book,role:'A',frameNote:'override',revision:3}),/ALREADY_FINALIZED/);
 await assert.rejects(()=>store.save({book:{...book,current_scene:{prose:'Совершенно другая сцена'}},role:'A',frameNote:'new'}),/SCENE_STALE/);
 await db.query('UPDATE novel2_books SET turn_no=8 WHERE id=$1',[book.id]);
 await assert.rejects(()=>store.save({book,role:'B',frameNote:'Новый ракурс',revision:1}),/REVISION_CONFLICT/);
 const attempts=await db.query('SELECT count(*)::int AS n FROM novel2_shot_attempts WHERE shot_id=$1',[first.id]);
 assert.equal(attempts.rows[0].n,0,'Saving drafts must never reserve paid attempt');
 console.log('NIGHT4TWO_V32_SHOT_POSTGRES_OK role_isolation=true, revision_guard=true, no_paid_attempts=true');
}finally{await db.query('DELETE FROM novel2_books WHERE id=$1',[book.id]);await db.end()}
