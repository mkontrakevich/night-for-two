import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,assertProductionConfig} from './config.js';
import {authenticate} from './auth.js';
import {
  initDb,latestBook,createBook,appendTurn,recentTurns,advanceBook,
  identities,saveIdentity,approveIdentity,claimSyntheticControl,
  getVisual,previousVisual,saveVisual,db
} from './db.js';
import {createStoryBible,continueStory,generateAiCharacterReply} from './prose-engine.js';
import {analyzeIdentity,buildLock} from './identity-engine.js';
import {buildCharacterCard,buildSyntheticCharacter} from './character-builder.js';
import {generateVisual,generateCalibration,generateSyntheticReference} from './visual-engine.js';
import {fetchRelationshipContext,sliceRelationshipContext} from './relationship-context.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const htmlPath=path.resolve(__dirname,'../public/index.html');

function send(res,status,payload,type='application/json; charset=utf-8'){
  const body=type.startsWith('application/json')?JSON.stringify(payload):String(payload);
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','content-length':Buffer.byteLength(body)});
  res.end(body);
}
async function bodyJson(req){
  const chunks=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>18_000_000)throw new Error('BODY_TOO_LARGE');chunks.push(chunk);}
  if(!chunks.length)return{};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function characterSummary(identity){
  const card=identity?.character_card||{};
  const meta=identity?.builder_meta||{};
  return{
    ready:Boolean(identity?.approved&&card?.passport),
    name:String(card?.passport?.fiction_name||''),
    archetype:String(card?.passport?.archetype||''),
    story_role:String(card?.passport?.story_role||''),
    synthetic:Boolean(meta?.synthetic),
    control_mode:String(meta?.control_mode||'human'),
    relationship_grounded:Boolean(card?.behavioral_baseline?.relationship_grounded)
  };
}
function isAiControlled(ids,role){
  return Boolean(ids?.[role]?.approved&&ids?.[role]?.builder_meta?.synthetic&&ids?.[role]?.builder_meta?.control_mode==='ai');
}
function publicState(book,auth,ids={}){
  const summaries={A:characterSummary(ids.A),B:characterSummary(ids.B)};
  const base={
    role:auth.role,
    identity:{A:Boolean(summaries.A.ready),B:Boolean(summaries.B.ready)},
    characters:summaries,
    my_character:ids[auth.role]?.character_card||null
  };
  if(!book)return{mode:'home',...base};
  const scene=book.current_scene||{};
  return{
    mode:'reader',
    ...base,
    book:{id:book.id,title:book.title,chapter_no:book.chapter_no,turn_no:book.turn_no},
    scene,
    active_role:book.active_role,
    active_control_mode:isAiControlled(ids,book.active_role)?'ai':'human',
    can_reply:String(book.active_role)===String(auth.role)&&!isAiControlled(ids,book.active_role)
  };
}
async function driveAiTurns(book,ids,maxTurns=4){
  let current=book;
  for(let i=0;i<maxTurns&&current&&isAiControlled(ids,current.active_role);i++){
    const role=current.active_role;
    const history=await recentTurns(current.id,18);
    const auto=await generateAiCharacterReply({
      book:current,
      recentTurns:history,
      role,
      characterCard:ids[role]?.character_card||{}
    });
    const replyTurn=Number(current.turn_no||0)+1;
    await appendTurn(current.id,replyTurn,role,'reply',auto.reply,{
      action_key:auto.actionKey,
      control_mode:'ai',
      synthetic:true
    });
    const next=await continueStory({
      book:current,
      recentTurns:await recentTurns(current.id,18),
      playerRole:role,
      playerReply:auto.reply,
      actionKey:auto.actionKey
    });
    current=await advanceBook(current,{scene:next.scene,canon:next.canon,activeRole:next.scene.target_role});
  }
  if(current&&isAiControlled(ids,current.active_role)) throw new Error('NOVEL2_AI_TURN_LOOP');
  return current;
}

async function main(){
  assertProductionConfig();
  await initDb();
  const html=await fs.readFile(htmlPath,'utf8');

  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/novel2/health')return send(res,200,{ok:true,product:'interactive_novel_2'});
      if(req.method==='GET'&&(url.pathname==='/novel2'||url.pathname==='/novel2/'))return send(res,200,html,'text/html; charset=utf-8');

      if(!url.pathname.startsWith('/novel2/api/'))return send(res,404,{ok:false,error:'NOT_FOUND'});
      const auth=authenticate(req);if(!auth)return send(res,403,{ok:false,error:'NOVEL2_ACCESS_DENIED'});
      const input=await bodyJson(req);
      let book=await latestBook();
      let ids=await identities();

      // An actual authenticated player immediately takes control of a synthetic
      // stand-in created for their role. The visual identity stays unchanged
      // inside an active novel, so the story never suffers an identity swap.
      if(ids[auth.role]?.builder_meta?.synthetic&&ids[auth.role]?.builder_meta?.control_mode==='ai'){
        await claimSyntheticControl(auth.role);
        ids=await identities();
      }

      if(url.pathname==='/novel2/api/state'){
        if(book){
          book=await driveAiTurns(book,ids);
        }
        return send(res,200,{ok:true,state:publicState(book,auth,ids)});
      }

      if(url.pathname==='/novel2/api/start'){
        ids=await identities();
        if(!ids.A?.approved||!ids.B?.approved||!ids.A?.character_card?.passport||!ids.B?.character_card?.passport){
          return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_CARDS_REQUIRED'});
        }
        if(!book){
          const relationship=await fetchRelationshipContext();
          const bible=await createStoryBible({characters:{A:ids.A.character_card,B:ids.B.character_card},relationshipContext:relationship});
          book=await createBook({title:bible.title,storyBible:bible,scene:bible.first_scene,activeRole:bible.first_scene.target_role});
        }
        book=await driveAiTurns(book,ids);
        return send(res,200,{ok:true,state:publicState(book,auth,ids)});
      }

      if(url.pathname==='/novel2/api/reply'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        if(String(book.active_role)!==auth.role||isAiControlled(ids,auth.role))return send(res,409,{ok:false,error:'NOVEL2_NOT_YOUR_TURN'});
        const reply=String(input.reply||'').trim();
        if(reply.length<1||reply.length>3000)return send(res,400,{ok:false,error:'NOVEL2_REPLY_INVALID'});

        const replyTurn=Number(book.turn_no||0)+1;
        await appendTurn(book.id,replyTurn,auth.role,'reply',reply,{action_key:String(input.action_key||'')});
        const history=await recentTurns(book.id,18);
        const next=await continueStory({book,recentTurns:history,playerRole:auth.role,playerReply:reply,actionKey:String(input.action_key||'')});
        book=await advanceBook(book,{scene:next.scene,canon:next.canon,activeRole:next.scene.target_role});
        ids=await identities();
        book=await driveAiTurns(book,ids);
        return send(res,200,{ok:true,state:publicState(book,auth,ids)});
      }

      if(url.pathname==='/novel2/api/character/random'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_RANDOM_CHARACTER_ONLY_BEFORE_START'});
        const targetRole=auth.role==='A'?'B':'A';
        const existing=ids[targetRole];
        if(existing?.approved&&!existing?.builder_meta?.synthetic){
          return send(res,409,{ok:false,error:'NOVEL2_OTHER_PLAYER_ALREADY_READY'});
        }
        const counterpart=ids[auth.role]?.character_card||{};
        const relationship=await fetchRelationshipContext();
        const synthetic=await buildSyntheticCharacter({role:targetRole,counterpartCard:counterpart,relationshipContext:sliceRelationshipContext(relationship,targetRole)});
        const identityLock=buildLock(targetRole,synthetic.visualProfile);
        const identityDraft={
          identity_lock:identityLock,
          character_card:synthetic.characterCard,
          reference_images:[]
        };
        const reference=await generateSyntheticReference({identity:identityDraft,role:targetRole});
        const referenceData='data:image/jpeg;base64,'+reference.base64;
        const builderMeta={
          synthetic:true,
          control_mode:'ai',
          reference_count:0,
          generated_reference:true,
          created_by_role:auth.role,
          created_at:new Date().toISOString(),
          version:'synthetic-character-1'
        };
        const saved=await saveIdentity(targetRole,{
          profile:synthetic.visualProfile,
          characterCard:synthetic.characterCard,
          builderMeta,
          identityLock,
          referenceImages:[referenceData],
          approved:true
        });
        ids=await identities();
        return send(res,200,{
          ok:true,
          target_role:targetRole,
          character:saved.character_card,
          reference_image:referenceData,
          state:publicState(null,auth,ids)
        });
      }

      if(url.pathname==='/novel2/api/character/build'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
        if(refs.length<1)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_REFERENCES_REQUIRED'});
        const userFacts=input.user_facts&&typeof input.user_facts==='object'?input.user_facts:{};
        const analyzed=await analyzeIdentity({role,referenceImages:refs,userFacts});
        const relationship=await fetchRelationshipContext();
        const characterCard=await buildCharacterCard({
          role,
          visualProfile:analyzed.profile,
          userFacts,
          referenceCount:refs.length,
          relationshipContext:sliceRelationshipContext(relationship,role)
        });
        const builderMeta={
          synthetic:false,
          control_mode:'human',
          reference_count:refs.length,
          coverage:analyzed.profile?.reference_coverage||{},
          created_at:new Date().toISOString(),
          version:'character-builder-1'
        };
        const saved=await saveIdentity(role,{
          profile:analyzed.profile,
          characterCard,
          builderMeta,
          identityLock:analyzed.identityLock,
          referenceImages:refs,
          approved:false
        });
        // Persist the expensive analysis/card before image calibration.
        // Calibration runs as a separate request so a slow or interrupted image
        // provider never forces the user to re-upload and re-analyse photos.
        return send(res,200,{
          ok:true,
          character:characterCard,
          identity:{role,approved:false,version:saved.version,coverage:builderMeta.coverage},
          calibration_required:true
        });
      }

      if(url.pathname==='/novel2/api/identity/analyze'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
        if(refs.length<1)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_REFERENCES_REQUIRED'});
        const analyzed=await analyzeIdentity({role,referenceImages:refs,userFacts:input.user_facts||{}});
        const relationship=await fetchRelationshipContext();
        const characterCard=await buildCharacterCard({role,visualProfile:analyzed.profile,userFacts:input.user_facts||{},referenceCount:refs.length,relationshipContext:sliceRelationshipContext(relationship,role)});
        const saved=await saveIdentity(role,{
          profile:analyzed.profile,
          characterCard,
          builderMeta:{
            synthetic:false,
            control_mode:'human',
            reference_count:refs.length,
            coverage:analyzed.profile?.reference_coverage||{},
            version:'character-builder-1'
          },
          identityLock:analyzed.identityLock,
          referenceImages:refs,
          approved:false
        });
        return send(res,200,{ok:true,identity:{role,approved:false,version:saved.version,profile:saved.profile},calibration_required:true});
      }

      if(url.pathname==='/novel2/api/identity/register'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        const profile=input.profile&&typeof input.profile==='object'?input.profile:{};
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
        if(!Object.keys(profile).length)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_PROFILE_REQUIRED'});
        const identityLock=buildLock(role,profile);
        await saveIdentity(role,{
          profile,
          characterCard:input.character_card||{},
          builderMeta:{synthetic:false,control_mode:'human',...(input.builder_meta||{})},
          identityLock,
          referenceImages:refs,
          approved:Boolean(input.approved)
        });
        ids=await identities();
        return send(res,200,{ok:true,identity:{role,approved:Boolean(ids[role]?.approved),version:ids[role]?.version||1}});
      }

      if(url.pathname==='/novel2/api/identity/approve'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const saved=await approveIdentity(auth.role);
        return send(res,200,{ok:true,identity:{role:auth.role,approved:true,version:saved.version}});
      }

      if(url.pathname==='/novel2/api/identity/calibrate'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        ids=await identities();
        const identity=ids[auth.role];
        if(!identity)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_NOT_FOUND'});
        const calibration=await generateCalibration({identity,role:auth.role});
        return send(res,200,{ok:true,calibration:'data:image/jpeg;base64,'+calibration.base64});
      }

      if(url.pathname==='/novel2/api/visual'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        ids=await identities();
        if(!ids.A?.approved||!ids.B?.approved)return send(res,409,{ok:false,error:'NOVEL2_IDENTITY_NOT_READY'});
        const visualKey='turn-'+String(book.turn_no||0);
        const cached=await getVisual(book.id,visualKey);
        if(cached?.image_base64)return send(res,200,{ok:true,cached:true,image:'data:image/jpeg;base64,'+cached.image_base64,model:cached.model,prompt:cached.prompt});
        const previous=await previousVisual(book.id,Number(book.turn_no||0));
        const generated=await generateVisual({scene:book.current_scene||{},identities:ids,previousVisual:previous||{}});
        await saveVisual({
          bookId:book.id,
          turnNo:Number(book.turn_no||0),
          visualKey,
          prompt:generated.prompt,
          model:generated.model,
          imageBase64:generated.base64,
          meta:{continuity:String(book.current_scene?.visual_beat||'').slice(0,1200)}
        });
        return send(res,200,{ok:true,cached:false,image:'data:image/jpeg;base64,'+generated.base64,model:generated.model,prompt:generated.prompt});
      }

      return send(res,404,{ok:false,error:'NOT_FOUND'});
    }catch(error){
      console.error('NOVEL2_REQUEST_FAILED',String(error?.stack||error));
      return send(res,500,{ok:false,error:String(error?.message||'NOVEL2_ERROR').slice(0,240)});
    }
  });

  server.listen(config.port,'0.0.0.0',()=>console.log('NOVEL2_LISTENING',config.port));
}

main().catch(async error=>{
  console.error('NOVEL2_FATAL',error);
  try{await db.end();}catch{}
  process.exit(1);
});
