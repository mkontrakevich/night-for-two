import {createStoryLaunchQueue,publicLaunchJob,publishStoryLaunch} from './story-launch.js';
import {assertExpectedTurn} from './pipeline-contract.js';
import http from 'node:http';
import {illustrationWorkbenchRequest} from './illustration-workbench-proxy.js';
import crypto from 'node:crypto';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,assertProductionConfig} from './config.js';
import {authenticate} from './auth.js';
import {
  initDb,latestBook,listBooks,renameBook,deleteBook,activateBook,createBook,appendTurn,pendingReply,withBookPipelineLock,recentTurns,advanceBook,archiveBook,
  identities,saveIdentity,approveIdentity,
  createStoryDraft,getStoryDraft,listStoryDrafts,deleteStoryDraft,markStoryDraftUsed,
  saveBookCast,getBookCast,claimBookCastControl,updateBookCastReference,
  listCharacterLooks,saveCharacterLook,ensureCanonicalCharacterLook,selectCharacterLook,
  getVisual,previousVisual,saveVisual,db,pairKey
} from './db.js';
import {createStoryBlueprint,createStoryBible,continueStory,generateAiCharacterReply} from './prose-engine.js';
import {analyzeIdentity,referenceOnlyIdentity,buildLock,buildBaseActorCard} from './identity-engine.js';
import {buildCharacterCard,buildSyntheticCharacter,normalizeCharacterCard} from './character-builder.js';
import {generateVisual,generateCalibration,calibrationSpec,generateSyntheticReference,generateCharacterLook,characterLookDefinition} from './visual-engine.js';
import {resizeReferences} from './ai.js';
import {initLobbyWorldStore,getLobbyWorld,lobbyWorldStatus,prepareLobbyWorld,completeLobbyWorld} from './lobby-world-store.js';
import {secretHostTurn} from './secret-host-engine.js';
import {fetchRelationshipContext,sliceRelationshipContext,explicitGenderForRole} from './relationship-context.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const htmlPath=path.resolve(__dirname,'../public/index.html');

// One active generation per authenticated player. The task runs on the origin
// after the HTTP request ends; re-opening the Mini App can reconnect to it.
// The canonical result is committed to PostgreSQL before reporting success.
const actorSheetJobs=new Map();
const ACTOR_SHEET_MAX_MS=1200000;

function serviceAuthenticated(req){
  const got=String(req.headers['x-novel2-service-key']||'');
  const expected=crypto.createHash('sha256').update('novel2-ai-v1:'+config.botToken).digest('hex');
  if(got.length!==expected.length)return false;
  return crypto.timingSafeEqual(Buffer.from(got),Buffer.from(expected));
}
function beginEdgeActorJob(role,{force=false}={}){
  const existing=actorSheetJobs.get(role);
  markActorJobTimedOut(existing);
  if(existing?.status==='working'||(existing?.status==='ready'&&!force))return{job:existing,fresh:false};
  const job={jobId:crypto.randomUUID(),status:'working',phase:'actor_sheet',
    startedAt:Date.now(),finishedAt:null,errorCode:null,calibration:'',external:true};
  actorSheetJobs.set(role,job);
  return{job,fresh:true};
}

function actorSheetJobView(job,includeResult=false){
  if(!job)return{status:'idle'};
  const view={status:job.status,phase:job.phase||'actor_sheet',
    started_at:job.startedAt||null,finished_at:job.finishedAt||null,
    elapsed_ms:job.startedAt?Math.max(0,(job.finishedAt||Date.now())-job.startedAt):0,
    error_code:job.status==='failed'?job.errorCode:null};
  if(includeResult&&job.status==='ready')view.calibration=job.calibration;
  return view;
}
function markActorJobTimedOut(job){
  if(job?.status==='working'&&Date.now()-job.startedAt>ACTOR_SHEET_MAX_MS){
    job.status='failed';job.errorCode='GENERATION_TIMEOUT';job.finishedAt=Date.now();
    console.error('NOVEL2_ACTOR_SHEET_TIMEOUT',{duration_ms:job.finishedAt-job.startedAt});
  }
}
function launchActorSheetJob(role,identity,{force=false}={}){
  const existing=actorSheetJobs.get(role);
  markActorJobTimedOut(existing);
  if(existing?.status==='working'||(existing?.status==='ready'&&!force))return existing;
  const job={status:'working',phase:'actor_sheet',startedAt:Date.now(),
    finishedAt:null,errorCode:null,calibration:''};
  actorSheetJobs.set(role,job);
  void (async()=>{
    try{
      const calibration=await generateCalibration({identity,role});
      if(actorSheetJobs.get(role)!==job||job.status!=='working')return;
      if(!calibration?.base64)throw new Error('NOVEL2_ACTOR_SHEET_EMPTY');
      job.phase='saving';
      await saveCharacterLook({
        role,lookKey:'canonical',title:'Нейтральная карточка актёра',
        prompt:calibration.prompt,model:calibration.model,
        imageBase64:calibration.base64,isPrimary:true
      });
      if(actorSheetJobs.get(role)!==job)return;
      job.calibration='data:image/jpeg;base64,'+calibration.base64;
      job.status='ready';
    }catch(error){
      if(actorSheetJobs.get(role)!==job||job.status!=='working')return;
      const message=String(error?.message||'');
      job.errorCode=/ACTOR_SHEET_REFERENCES_REQUIRED|IMAGE_REFERENCES_MISSING/i.test(message)
        ?'GENERATION_REFERENCES_MISSING':
        /NOVEL2_IMAGE_402|insufficient.credits|payment.required/i.test(message)
        ?'GENERATION_CREDITS_EXHAUSTED':
        /NOVEL2_IMAGE_429|rate.limit/i.test(message)
        ?'GENERATION_RATE_LIMIT':
        /NOVEL2_IMAGE_403|PROVIDER_ACCESS_BLOCKED/i.test(message)
        ?'GENERATION_PROVIDER_ACCESS_BLOCKED':
        /TIMEOUT|Abort/i.test(message)?'GENERATION_TIMEOUT':
        /TRANSPORT|fetch failed|ECONNRESET/i.test(message)?'GENERATION_CONNECTION_INTERRUPTED':
        /EDGE_IMAGE|NOVEL2_IMAGE_[45][0-9][0-9]|EMPTY_IMAGE|IMAGE_EMPTY/i.test(message)
        ?'GENERATION_PROVIDER_FAILED':'GENERATION_FAILED';
      job.status='failed';
      console.error('NOVEL2_ACTOR_SHEET_FAILED',{
        error_code:job.errorCode,duration_ms:Date.now()-job.startedAt
      });
    }finally{
      if(actorSheetJobs.get(role)===job)job.finishedAt=Date.now();
    }
  })();
  return job;
}

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
function hasPersistentHumanIdentity(identity){
  return Boolean(
    identity?.approved &&
    identity?.profile &&
    identity?.identity_lock &&
    !identity?.builder_meta?.synthetic
  );
}
function storyContextForCast(draft,blueprint={}){
  return{
    title:String(draft?.title||blueprint?.title||''),
    logline:String(draft?.logline||blueprint?.logline||''),
    genre_tone:String(blueprint?.genre_tone||blueprint?.tone||''),
    premise:String(blueprint?.premise||blueprint?.story_premise||blueprint?.central_conflict||'')
  };
}
async function createStoryAiCastEntry({
  runtimeRole=null,
  slot={},
  draft={},
  blueprint={},
  counterpartCard={},
  relationshipContext={},
  genderHint='',
  generateReference=false,
  memo=(_key,work)=>work()
}={}){
  const slotKey=String(slot?.slot_key||runtimeRole||'story-character').slice(0,60);
  const roleKey=String(runtimeRole||slotKey);
  const synthetic=await memo(`synthetic:${roleKey}`,()=>buildSyntheticCharacter({
    role:roleKey,
    counterpartCard,
    relationshipContext,
    genderHint,
    storyContext:storyContextForCast(draft,blueprint),
    roleBrief:slot
  }));
  const identityLock=buildLock('story:'+String(draft?.id||'draft')+':'+roleKey,synthetic.visualProfile);
  let references=[];
  if(generateReference){
    const generated=await memo(`reference:${roleKey}`,()=>generateSyntheticReference({
      identity:{identity_lock:identityLock,character_card:synthetic.characterCard,reference_images:[]},
      role:synthetic.characterCard?.passport?.fiction_name||roleKey
    }));
    references=['data:image/jpeg;base64,'+generated.base64];
  }
  return{
    slot_key:runtimeRole||slotKey,
    narrative_function:String(slot?.narrative_function||slot?.description||'').slice(0,500),
    source_type:'story_ai',
    source_id:'story:'+String(draft?.id||'draft')+':'+slotKey,
    interactive_role:runtimeRole||null,
    display_name:synthetic.characterCard?.passport?.fiction_name||String(slot?.narrative_function||'Персонаж истории'),
    character_card:synthetic.characterCard,
    visual_profile:synthetic.visualProfile||{},
    identity_lock:identityLock,
    reference_images:references,
    control_mode:'ai'
  };
}
function bookCastRole(bookCast=[],role){
  return (Array.isArray(bookCast)?bookCast:[]).find(x=>String(x?.interactive_role||'')===String(role))||null;
}
// Keep full reference images in the persistent identity only. The public state
// needs a small avatar, not a multi-megabyte reference image. Large Base64
// state payloads previously caused Cloudflare VPC API reads to time out.
const avatarThumbCache=new Map();
async function compactAvatar(value=''){
  const source=String(value||'');
  if(!source)return'';
  const match=source.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
  if(!match)return/^https:\/\//i.test(source)?source:'';
  const hash=crypto.createHash('sha256').update(source).digest('hex');
  if(avatarThumbCache.has(hash))return avatarThumbCache.get(hash);
  try{
    const buffer=Buffer.from(match[1],'base64');
    const thumbnail=await sharp(buffer,{limitInputPixels:40_000_000})
      .rotate().resize({width:240,height:240,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:68}).toBuffer();
    const uri='data:image/jpeg;base64,'+thumbnail.toString('base64');
    if(avatarThumbCache.size>=24)avatarThumbCache.delete(avatarThumbCache.keys().next().value);
    avatarThumbCache.set(hash,uri);
    return uri;
  }catch{return''}
}

async function castCharacterSummary(entry){
  const role=String(entry?.interactive_role||entry?.slot_key||'A');
  const card=normalizeCharacterCard(entry?.character_card||{},['A','B'].includes(role)?role:'A');
  return{
    slot_key:String(entry?.slot_key||''),
    name:String(entry?.display_name||card?.passport?.fiction_name||''),
    story_role:String(card?.passport?.story_role||''),
    gender:String(card?.passport?.gender||''),
    source_type:String(entry?.source_type||''),
    source_id:String(entry?.source_id||''),
    interactive_role:entry?.interactive_role||null,
    control_mode:String(entry?.control_mode||'ai'),
    avatar:await compactAvatar(Array.isArray(entry?.reference_images)?entry.reference_images[0]:''),
    character_card:card
  };
}
async function characterSummary(identity,role='A'){
  const meta=identity?.builder_meta||{};
  const human=Boolean(identity?.profile&&identity?.identity_lock&&!meta.synthetic);
  // Legacy identities can contain an old fictional biography. Never expose
  // it as a player profile; identity onboarding displays only observed appearance.
  const card=human
    ?buildBaseActorCard({role,profile:identity.profile,sourcePhotoCount:meta.reference_count||identity.reference_images?.length||0})
    :normalizeCharacterCard(identity?.character_card||{},role);
  return {
    ready:Boolean(identity?.approved&&human),
    name:human?'Карточка актёра':String(card?.passport?.fiction_name||''),
    archetype:'',
    story_role:human?'':String(card?.passport?.story_role||''),
    gender:human?'':String(card?.passport?.gender||''),
    synthetic:Boolean(meta.synthetic),
    identity_only:human,
    control_mode:String(meta.control_mode||'human'),
    relationship_grounded:false,
    avatar:await compactAvatar(Array.isArray(identity?.reference_images)?identity.reference_images[0]:''),
    character_card:card
  };
}

function characterLookPayload(row){
  return{
    key:String(row?.look_key||''),
    title:String(row?.title||''),
    image:row?.image_base64?'data:image/jpeg;base64,'+row.image_base64:'',
    is_primary:Boolean(row?.is_primary),
    model:String(row?.model||'')
  };
}
async function characterLooksForRole(role,identity){
  const identityOnly=Boolean(identity?.profile&&identity?.identity_lock&&!identity?.builder_meta?.synthetic);
  // A source photo is an input reference, not an actor card. Older builds
  // seeded the first uploaded photo as the canonical look; hide that legacy
  // row for human base identities until a generated actor sheet exists.
  if(identity&&!identityOnly)await ensureCanonicalCharacterLook(role,identity);
  const rows=await listCharacterLooks(role);
  const visible=identityOnly
    ?rows.filter(x=>!(x.look_key==='canonical'&&x.model==='existing'&&x.prompt==='Existing canonical identity reference'))
    :rows;
  return visible.map(characterLookPayload);
}
function isAiControlled(ids,role,bookCast=[]){
  const castEntry=bookCastRole(bookCast,role);
  if(castEntry)return castEntry.control_mode==='ai';
  return Boolean(ids?.[role]?.approved&&ids?.[role]?.builder_meta?.synthetic&&ids?.[role]?.builder_meta?.control_mode==='ai');
}
// The private blueprint and complete cast never leave the story backend.
// Character appearances occur only in narrative scenes when the director reveals them.
function publicStoryDraft(draft){
 if(!draft)return null;
 const bp=draft.blueprint||{};
 return {
   id:draft.id,title:String(draft.title||bp.title||''),
   logline:'',
   status:String(draft.status||'draft'),
   created_at:draft.created_at,updated_at:draft.updated_at,
   blueprint:{
     title:String(bp.title||draft.title||''),
     logline:'',
     genre_tone:String(bp.genre_tone||'')
   }
 };
}
async function publicState(book,auth,ids={},bookCast=[]){
  const own=await characterSummary(ids[auth.role],auth.role);
  const base={
    role:auth.role,
    identity:{[auth.role]:Boolean(own.ready)},
    characters:{[auth.role]:own},
    my_character:ids[auth.role]?.profile
      ?buildBaseActorCard({role:auth.role,profile:ids[auth.role].profile,sourcePhotoCount:ids[auth.role]?.reference_images?.length||0})
      :null
  };
  if(!book)return{mode:'home',...base};
  const scene=book.current_scene||{};
  const canReply=!Boolean(scene.noir_progress?.finale)&&String(book.active_role)===String(auth.role)&&!isAiControlled(ids,book.active_role,bookCast);
  const ownCast=(Array.isArray(bookCast)?bookCast:[]).filter(
    entry=>String(entry.interactive_role||'')===String(auth.role)
  );
  return{
    mode:'reader',
    ...base,
    book:{id:book.id,title:book.title,chapter_no:book.chapter_no,turn_no:book.turn_no},
    scene,
    active_role:book.active_role,
    active_control_mode:isAiControlled(ids,book.active_role,bookCast)?'ai':'human',
    cast:await Promise.all(ownCast.map(castCharacterSummary)),
    can_reply:canReply,
    pending_reply:canReply?await pendingReply(book.id,book.turn_no,auth.role):null
  };
}
async function driveAiTurns(book,ids,bookCast=[],maxTurns=4){
  let current=book;
  for(let i=0;i<maxTurns&&current&&!current.current_scene?.noir_progress?.finale&&isAiControlled(ids,current.active_role,bookCast);i++){
    const role=current.active_role;
    const humanRole=role==='A'?'B':'A';
    const history=await recentTurns(current.id,18);
    const savedReply=await pendingReply(current.id,current.turn_no,role);
    const auto=savedReply?{reply:savedReply.reply,actionKey:savedReply.action_key}:await generateAiCharacterReply({
      book:current,
      recentTurns:history,
      role,
      characterCard:normalizeCharacterCard(bookCastRole(bookCast,role)?.character_card||ids[role]?.character_card||{},role)
    });
    const replyTurn=Number(current.turn_no||0)+1;
    await appendTurn(current.id,replyTurn,role,'reply',auto.reply,{
      action_key:auto.actionKey,
      control_mode:'ai',
      synthetic:true,
      generated_automatically:true
    });
    const next=await continueStory({
      book:current,
      recentTurns:await recentTurns(current.id,18),
      playerRole:role,
      playerReply:auto.reply,
      actionKey:auto.actionKey
    });

    // An AI stand-in must answer by itself and then hand control back to the
    // human participant. The prose model may keep target_role on the same
    // character for dramatic reasons; for a stand-in this would create an AI
    // monologue or loop, so we normalize the interaction boundary here.
    next.scene.target_role=humanRole;
    current=await advanceBook(current,{scene:next.scene,canon:next.canon,activeRole:humanRole});
  }
  if(current&&!current.current_scene?.noir_progress?.finale&&isAiControlled(ids,current.active_role,bookCast)) throw new Error('NOVEL2_AI_TURN_LOOP');
  return current;
}

const launchQueue=createStoryLaunchQueue({db,pairKey,
  validate:async(role,draftId)=>{
    const draft=await getStoryDraft(draftId);
    if(!draft)throw new Error('NOVEL2_STORY_DRAFT_NOT_FOUND');
    const ids=await identities();
    if(!hasPersistentHumanIdentity(ids[role]))throw new Error('NOVEL2_CURRENT_PLAYER_CHARACTER_REQUIRED');
  },
  execute:async({role,draftId,checkpoint,save,client})=>{
    const step=async(key,work)=>{
      if(Object.hasOwn(checkpoint,key))return checkpoint[key];
      await save(key);
      const result=await work();
      await save(key,{[key]:result});checkpoint[key]=result;
      return result;
    };
    const context=await step('context',async()=>({draft:await getStoryDraft(draftId),ids:await identities(),relationship:await fetchRelationshipContext()}));
    const {draft}=context,auth={role};
    const blueprint=draft.blueprint||{};
    const slots=Array.isArray(blueprint.cast_slots)?blueprint.cast_slots:[];
    const interactive=slots.filter(x=>x?.interactive).slice(0,2);
    const support=slots.filter(x=>!x?.interactive).slice(0,6);
    if(interactive.length!==2)throw new Error('NOVEL2_STORY_INTERACTIVE_SLOTS_INVALID');

    const {ids,relationship}=context;
    const assignments={};
    const castEntries=[];
    const playerCards={};
    const runtimeRoles=['A','B'];

    for(let i=0;i<2;i++){
      const slot=interactive[i];
      const runtimeRole=runtimeRoles[i];
      const identity=ids[runtimeRole];
      const humanReady=hasPersistentHumanIdentity(identity);
      let entry;

      if(runtimeRole===auth.role||humanReady){
        if(runtimeRole===auth.role&&!humanReady)throw new Error('NOVEL2_CURRENT_PLAYER_CHARACTER_REQUIRED');
        if(!humanReady){
          entry=await createStoryAiCastEntry({
            runtimeRole,
            slot,
            draft,
            blueprint,
            counterpartCard:playerCards[auth.role]||{},
            relationshipContext:sliceRelationshipContext(relationship,runtimeRole),
            genderHint:explicitGenderForRole(relationship,runtimeRole),
            generateReference:true, memo:step
          });
        }else{
          const identityOnly=Boolean(identity?.profile&&identity?.identity_lock&&!identity?.builder_meta?.synthetic);
          const storyCard=identityOnly
            ?await step(`player:${runtimeRole}`,()=>buildCharacterCard({
                role:runtimeRole,
                visualProfile:identity.profile||{},
                userFacts:{},
                referenceCount:Array.isArray(identity.reference_images)?identity.reference_images.length:1,
                relationshipContext:sliceRelationshipContext(relationship,runtimeRole),
                storyContext:storyContextForCast(draft,blueprint),
                roleBrief:slot
              }))
            :normalizeCharacterCard(identity.character_card,runtimeRole);
          entry={
            slot_key:runtimeRole,
            narrative_function:String(slot.narrative_function||slot.description||'').slice(0,500),
            source_type:'player',
            source_id:runtimeRole,
            interactive_role:runtimeRole,
            display_name:storyCard?.passport?.fiction_name||('Игрок '+runtimeRole),
            character_card:storyCard,
            visual_profile:identity.profile||{},
            identity_lock:identity.identity_lock||'',
            reference_images:identity.reference_images||[],
            control_mode:'human'
          };
        }
      }else{
        entry=await createStoryAiCastEntry({
          runtimeRole,
          slot,
          draft,
          blueprint,
          counterpartCard:ids[auth.role]?.character_card||playerCards[auth.role]||{},
          relationshipContext:sliceRelationshipContext(relationship,runtimeRole),
          genderHint:explicitGenderForRole(relationship,runtimeRole),
          generateReference:true, memo:step
        });
      }

      castEntries.push(entry);
      playerCards[runtimeRole]=entry.character_card;
      assignments[slot.slot_key]=entry.source_type==='player'?'player:'+runtimeRole:'story_ai:'+runtimeRole;
    }

    for(let i=0;i<support.length;i++){
      const slot=support[i];
      const entry=await createStoryAiCastEntry({
        slot,
        draft,
        blueprint,
        counterpartCard:playerCards.A||playerCards.B||{},
        relationshipContext:{},
        genderHint:'',
        generateReference:false, memo:step
      });
      castEntries.push(entry);
      assignments[slot.slot_key]='story_ai:'+entry.slot_key;
    }

    const supportingCast=castEntries.filter(x=>!x.interactive_role).map(x=>({
      slot_key:x.slot_key,
      narrative_function:x.narrative_function,
      character_card:x.character_card
    }));
    const bible=await step('first_chapter',()=>createStoryBible({
      characters:{A:playerCards.A,B:playerCards.B},
      supportingCast,
      blueprint,
      relationshipContext:relationship,
      resumeCandidate:checkpoint.first_chapter_candidate||null,
      onCandidate:async(candidate)=>{
        await save('first_chapter',{first_chapter_candidate:candidate});
        checkpoint.first_chapter_candidate=candidate;
      }
    }));


    bible.title=bible.title||draft.title;
    await save('publishing');
    await publishStoryLaunch(client,{pair:pairKey(),draftId,bible,castEntries,assignments});
  }
});

async function main(){
  assertProductionConfig();
  await initDb();
  await initLobbyWorldStore();
  await launchQueue.init();
  const html=await fs.readFile(htmlPath,'utf8');
  const illustrationHtml=await fs.readFile(path.resolve(__dirname,'../public/illustrations.html'),'utf8');
  const launchClientJs=await fs.readFile(path.resolve(__dirname,'../public/story-launch-client.js'),'utf8');
  const noirJs=await fs.readFile(path.resolve(__dirname,'../public/noir-experience.js'),'utf8');
  const noirCss=await fs.readFile(path.resolve(__dirname,'../public/noir-experience.css'),'utf8');
  const noirGatewayJs=await fs.readFile(path.resolve(__dirname,'../public/noir-gateway.js'),'utf8');
  const noirGatewayCss=await fs.readFile(path.resolve(__dirname,'../public/noir-gateway.css'),'utf8');
  const hostJs=await fs.readFile(path.resolve(__dirname,'../public/noir-host.js'),'utf8');
  const hostCss=await fs.readFile(path.resolve(__dirname,'../public/noir-host.css'),'utf8');

  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/novel2/illustrations.html')return send(res,200,illustrationHtml,'text/html; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/health')return send(res,200,{ok:true,product:'interactive_novel_2',story_launch_api:1});
      if(req.method==='GET'&&(url.pathname==='/novel2'||url.pathname==='/novel2/'))return send(res,200,html,'text/html; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/noir-experience.js')return send(res,200,noirJs,'text/javascript; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/noir-experience.css')return send(res,200,noirCss,'text/css; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/noir-gateway.js')return send(res,200,noirGatewayJs,'text/javascript; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/noir-gateway.css')return send(res,200,noirGatewayCss,'text/css; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/story-launch-client.js')return send(res,200,launchClientJs,'text/javascript; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/noir-host.js')return send(res,200,hostJs,'text/javascript; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/novel2/noir-host.css')return send(res,200,hostCss,'text/css; charset=utf-8');

      if(!url.pathname.startsWith('/novel2/api/'))return send(res,404,{ok:false,error:'NOT_FOUND'});
      // Service-to-service read-only migration. Private legacy records are never
      // exposed through public authenticated guest APIs or GitHub logs.
      if(url.pathname==='/novel2/api/migration/batch'){
        if(req.method!=='POST'||!serviceAuthenticated(req))
          return send(res,403,{ok:false,error:'NOVEL2_MIGRATION_DENIED'});
        const input=await bodyJson(req);
        const table=String(input.table||'');
        const offset=Number(input.offset||0);
        if(!Number.isSafeInteger(offset)||offset<0||offset>10000000)
          return send(res,422,{ok:false,error:'NOVEL2_MIGRATION_OFFSET_INVALID'});
        const limit=2;
        const scoped={
          books:'SELECT * FROM novel2_books WHERE pair_key=$1 ORDER BY id LIMIT $2 OFFSET $3',
          turns:'SELECT t.* FROM novel2_turns t JOIN novel2_books b ON t.book_id=b.id WHERE b.pair_key=$1 ORDER BY t.id LIMIT $2 OFFSET $3',
          identity:'SELECT * FROM novel2_identity WHERE pair_key=$1 ORDER BY role LIMIT $2 OFFSET $3',
          ai_characters:'SELECT * FROM novel2_ai_characters WHERE $1::text<>\'\' ORDER BY id LIMIT $2 OFFSET $3',
          story_drafts:'SELECT * FROM novel2_story_drafts WHERE pair_key=$1 ORDER BY id LIMIT $2 OFFSET $3',
          book_cast:'SELECT c.* FROM novel2_book_cast c JOIN novel2_books b ON c.book_id=b.id WHERE b.pair_key=$1 ORDER BY c.book_id,c.slot_key LIMIT $2 OFFSET $3',
          character_looks:'SELECT * FROM novel2_character_looks WHERE pair_key=$1 ORDER BY role,look_key LIMIT $2 OFFSET $3',
          visuals:'SELECT v.* FROM novel2_visuals v JOIN novel2_books b ON v.book_id=b.id WHERE b.pair_key=$1 ORDER BY v.id LIMIT $2 OFFSET $3',
          lobby_world:'SELECT * FROM novel2_lobby_world WHERE pair_key=$1 ORDER BY role LIMIT $2 OFFSET $3'
        };
        if(!Object.hasOwn(scoped,table))return send(res,422,{ok:false,error:'NOVEL2_MIGRATION_TABLE_INVALID'});
        const {rows}=await db.query(scoped[table],[pairKey(),limit+1,offset]);
        const keyFor=row=>{
          if(table==='identity'||table==='lobby_world')return String(row.role);
          if(table==='character_looks')return String(row.role)+':'+String(row.look_key);
          if(table==='book_cast')return String(row.book_id)+':'+String(row.slot_key);
          return String(row.id);
        };
        const list=rows.slice(0,limit).map(row=>({key:keyFor(row),data:row}));
        return send(res,200,{ok:true,table,offset,records:list,
          next_offset:offset+list.length,more:rows.length>limit});
      }
      if(url.pathname==='/novel2/api/lobby/world/prepare'){
        if(req.method!=='POST'||!serviceAuthenticated(req))
          return send(res,403,{ok:false,error:'NOVEL2_LOBBY_PREPARE_DENIED'});
        const auth=authenticate(req);
        if(!auth)return send(res,403,{ok:false,error:'NOVEL2_ACCESS_DENIED'});
        const input=await bodyJson(req);
        try{
          const result=await prepareLobbyWorld({role:auth.role,place:input.place,mood:input.mood});
          return send(res,200,{ok:true,work:result.work,state:lobbyWorldStatus(result.state)});
        }catch(error){
          const code=String(error?.message||'NOVEL2_LOBBY_PREPARE_FAILED');
          if(/^NOVEL2_LOBBY_/.test(code))return send(res,400,{ok:false,error:code});
          throw error;
        }
      }
      if(url.pathname==='/novel2/api/lobby/world/work'){
        if(req.method!=='POST'||!serviceAuthenticated(req))
          return send(res,403,{ok:false,error:'NOVEL2_LOBBY_WORK_DENIED'});
        const input=await bodyJson(req),role=String(input.role||'');
        if(!['A','B'].includes(role))return send(res,400,{ok:false,error:'NOVEL2_LOBBY_ROLE_INVALID'});
        const row=await getLobbyWorld(role);
        if(!row||row.job_id!==String(input.job_id||'')||row.status!=='working')
          return send(res,409,{ok:false,error:'NOVEL2_LOBBY_JOB_STALE'});
        return send(res,200,{ok:true,work:{role,job_id:row.job_id,prompt:row.prompt,width:832,height:1344}});
      }
      if(url.pathname==='/novel2/api/lobby/world/complete'){
        if(req.method!=='POST'||!serviceAuthenticated(req))
          return send(res,403,{ok:false,error:'NOVEL2_LOBBY_COMPLETE_DENIED'});
        const input=await bodyJson(req),role=String(input.role||'');
        if(!['A','B'].includes(role))return send(res,400,{ok:false,error:'NOVEL2_LOBBY_ROLE_INVALID'});
        let base64='';
        if(input.status==='ready'){
          const image=String(input.image||'');
          if(image.length<1200||image.length>15_000_000||!/^[A-Za-z0-9+/=]+$/.test(image))
            return send(res,422,{ok:false,error:'NOVEL2_LOBBY_RESULT_INVALID'});
          const jpeg=await sharp(Buffer.from(image,'base64'),{limitInputPixels:10_000_000})
            .resize({width:960,withoutEnlargement:true})
            .jpeg({quality:83,mozjpeg:true}).toBuffer();
          base64=jpeg.toString('base64');
        }
        try{
          const row=await completeLobbyWorld({role,jobId:String(input.job_id||''),
            imageBase64:base64,model:String(input.model||''),errorCode:String(input.error_code||'GENERATION_FAILED')});
          return send(res,200,{ok:true,state:lobbyWorldStatus(row)});
        }catch(error){
          if(String(error?.message)==='NOVEL2_LOBBY_JOB_STALE')return send(res,409,{ok:false,error:'NOVEL2_LOBBY_JOB_STALE'});
          throw error;
        }
      }
      if(url.pathname==='/novel2/api/identity/calibrate/work'){
        if(req.method!=='POST'||!serviceAuthenticated(req))
          return send(res,403,{ok:false,error:'NOVEL2_ACTOR_WORK_DENIED'});
        const input=await bodyJson(req);
        const role=String(input.role||''),jobId=String(input.job_id||'');
        if(!['A','B'].includes(role))return send(res,400,{ok:false,error:'NOVEL2_ACTOR_ROLE_INVALID'});
        const job=actorSheetJobs.get(role);
        markActorJobTimedOut(job);
        if(!job||job.jobId!==jobId||job.status!=='working')
          return send(res,409,{ok:false,error:'NOVEL2_ACTOR_JOB_STALE'});
        const ids=await identities();
        const identity=ids[role];
        if(!identity?.identity_lock)return send(res,409,{ok:false,error:'NOVEL2_ACTOR_IDENTITY_MISSING'});
        const {prompt,references}=calibrationSpec({identity,role});
        const refs=await resizeReferences(references,480,4);
        if(!refs.length||refs.length!==references.length)
          return send(res,422,{ok:false,error:'NOVEL2_ACTOR_REFERENCES_INVALID'});
        return send(res,200,{ok:true,work:{job_id:jobId,role,prompt,identity_lock:identity.identity_lock,refs,width:832,height:1344}});
      }
      if(url.pathname==='/novel2/api/identity/calibrate/complete'){
        if(req.method!=='POST'||!serviceAuthenticated(req))
          return send(res,403,{ok:false,error:'NOVEL2_EDGE_CALLBACK_DENIED'});
        const input=await bodyJson(req);
        const role=String(input.role||''),jobId=String(input.job_id||'');
        if(!['A','B'].includes(role))return send(res,400,{ok:false,error:'NOVEL2_ACTOR_ROLE_INVALID'});
        const job=actorSheetJobs.get(role);
        if(!job||job.jobId!==jobId||job.status!=='working')
          return send(res,409,{ok:false,error:'NOVEL2_ACTOR_JOB_STALE'});
        if(input.status!=='ready'){
          job.status='failed';job.errorCode='GENERATION_PROVIDER_FAILED';job.finishedAt=Date.now();
          console.error('NOVEL2_ACTOR_SHEET_FAILED',{
            error_code:job.errorCode,duration_ms:job.finishedAt-job.startedAt
          });
          return send(res,200,{ok:true,job:actorSheetJobView(job)});
        }
        const image=String(input.image||'');
        if(image.length<1000||image.length>16000000||!/^[A-Za-z0-9+/=]+$/.test(image))
          return send(res,422,{ok:false,error:'NOVEL2_ACTOR_RESULT_INVALID'});
        const jpeg=await sharp(Buffer.from(image,'base64'),{limitInputPixels:10000000})
          .jpeg({quality:88}).toBuffer();
        const base64=jpeg.toString('base64');
        job.phase='saving';
        await saveCharacterLook({
          role,lookKey:'canonical',title:'Нейтральная карточка актёра',
          prompt:String(input.prompt||'').slice(0,16000),
          model:String(input.model||'workers-ai').slice(0,200),
          imageBase64:base64,isPrimary:true
        });
        job.calibration='data:image/jpeg;base64,'+base64;
        job.status='ready';job.finishedAt=Date.now();
        return send(res,200,{ok:true,job:actorSheetJobView(job)});
      }
      const auth=authenticate(req);if(!auth)return send(res,403,{ok:false,error:'NOVEL2_ACCESS_DENIED'});
      const input=await bodyJson(req);
      if(url.pathname.startsWith('/novel2/api/illustrations/')){
        const result=await illustrationWorkbenchRequest({method:req.method,action:url.pathname.slice('/novel2/api/illustrations/'.length),input,role:auth.role});
        return send(res,result.status,result.body);
      }
      if(url.pathname==='/novel2/api/story/draft/launch'){
        if(req.method!=='POST'||input.background!==true)return send(res,409,{ok:false,error:'NOVEL2_LAUNCH_RELOAD_REQUIRED'});
        try{return send(res,202,{ok:true,job:await launchQueue.start(auth.role,input.draft_id,{resume:input.resume===true})});}
        catch(error){return send(res,409,{ok:false,error:/^NOVEL2_/.test(error.message)?error.message:'NOVEL2_LAUNCH_START_FAILED'});}
      }
      if(url.pathname==='/novel2/api/story/draft/launch/status'){
        if(req.method!=='POST')return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
        if(input.draft_id&&!/^\d+$/.test(String(input.draft_id)))return send(res,400,{ok:false,error:'NOVEL2_LAUNCH_INPUT_INVALID'});
        const job=input.draft_id?await launchQueue.get(auth.role,input.draft_id):await launchQueue.latest(auth.role);
        let resultState=null;
        if(job?.status==='ready'&&job.book_id){
          const {rows}=await db.query('SELECT * FROM novel2_books WHERE id=$1 AND pair_key=$2',[job.book_id,pairKey()]);
          if(rows[0])resultState=await publicState(rows[0],auth,await identities(),await getBookCast(job.book_id));
        }
        return send(res,200,{ok:true,job:publicLaunchJob(job),state:resultState});
      }
      let book=await latestBook();
      let ids=await identities();
      let bookCast=book?await getBookCast(book.id):[];

      // An actual authenticated player immediately takes control of a synthetic
      // stand-in created for their role. The visual identity stays unchanged
      // inside an active novel, so the story never suffers an identity swap.
      if(book&&bookCastRole(bookCast,auth.role)?.control_mode==='ai'&&hasPersistentHumanIdentity(ids[auth.role])){
        await claimBookCastControl(book.id,auth.role);
        bookCast=await getBookCast(book.id);
      }

      if(url.pathname==='/novel2/api/books'){
        const books=await listBooks(30);
        const drafts=await listStoryDrafts(12);
        return send(res,200,{ok:true,books,drafts:drafts.map(publicStoryDraft)});
      }

      if(url.pathname==='/novel2/api/story/draft/delete'){
        const deleted=await deleteStoryDraft(input.draft_id);
        if(!deleted)return send(res,404,{ok:false,error:'NOVEL2_STORY_DRAFT_NOT_FOUND'});
        return send(res,200,{ok:true,deleted});
      }

      if(url.pathname==='/novel2/api/book/rename'){
        const updated=await renameBook(input.book_id,input.title);
        if(!updated)return send(res,404,{ok:false,error:'NOVEL2_BOOK_NOT_FOUND'});
        return send(res,200,{ok:true,book:updated});
      }

      if(url.pathname==='/novel2/api/book/delete'){
        const deleted=await deleteBook(input.book_id);
        if(!deleted)return send(res,404,{ok:false,error:'NOVEL2_BOOK_NOT_FOUND'});
        book=await latestBook();
        bookCast=book?await getBookCast(book.id):[];
        return send(res,200,{ok:true,deleted,state:await publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/book/open'){
        const opened=await activateBook(input.book_id);
        if(!opened)return send(res,404,{ok:false,error:'NOVEL2_BOOK_NOT_FOUND'});
        book=opened;
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:await publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/ai-characters'||url.pathname==='/novel2/api/ai-character/avatar'){
        return send(res,410,{ok:false,error:'NOVEL2_AI_CHARACTERS_ARE_STORY_SCOPED'});
      }

      if(url.pathname==='/novel2/api/story/draft/new'){
        if(!hasPersistentHumanIdentity(ids[auth.role]))
          return send(res,409,{ok:false,error:'NOVEL2_CURRENT_PLAYER_CHARACTER_REQUIRED'});
        const blueprint=await createStoryBlueprint({creativeBrief:input.creative_brief||''});
        const draft=await createStoryDraft({title:blueprint.title,logline:blueprint.logline,blueprint});
        return send(res,200,{ok:true,draft:publicStoryDraft(draft)});
      }

      if(url.pathname==='/novel2/api/story/drafts'){
        const drafts=await listStoryDrafts(12);
        return send(res,200,{ok:true,drafts:drafts.map(publicStoryDraft)});
      }

      if(url.pathname==='/novel2/api/host/turn'){
        const stage=String(input.stage||'');
        const approved=Boolean(ids?.[auth.role]?.approved);
        const rows=await listCharacterLooks(auth.role);
        const actorReady=rows.some(x=>x.look_key==='canonical'&&x.model!=='existing'&&x.image_base64);
        const world=await getLobbyWorld(auth.role);
        const place=stage==='place_reaction'?String(world?.place||input.place||''):'';
        try{
          const turn=await secretHostTurn({stage,place,mood:String(world?.mood||input.mood||'тайна'),
            actorReady,actorApproved:approved});
          return send(res,200,{ok:true,turn});
        }catch(error){
          const code=String(error?.message||'');
          if(/^NOVEL2_HOST_|^NOVEL2_LOBBY_PLACE/.test(code))
            return send(res,409,{ok:false,error:code});
          throw error;
        }
      }
      if(url.pathname==='/novel2/api/lobby/world/status'){
        const row=await getLobbyWorld(auth.role);
        return send(res,200,{ok:true,world:lobbyWorldStatus(row,{includeImage:true})});
      }
      if(url.pathname==='/novel2/api/lobby/world/start'){
        return send(res,409,{ok:false,error:'NOVEL2_LOBBY_EDGE_WORKFLOW_REQUIRED'});
      }
      if(url.pathname==='/novel2/api/state'){
        // State reads must stay fast and side-effect free. Never block app opening
        // on prose generation; AI-controlled turns advance through a separate
        // endpoint after the reader has rendered.
        return send(res,200,{ok:true,state:await publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/ai/advance'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        assertExpectedTurn(book,input);
        if(book.current_scene?.noir_progress?.finale)return send(res,200,{ok:true,state:await publicState(book,auth,ids,bookCast),advanced:false});
        if(!isAiControlled(ids,book.active_role,bookCast)){
          return send(res,200,{ok:true,state:await publicState(book,auth,ids,bookCast),advanced:false});
        }
        return await withBookPipelineLock(book.id,book.turn_no,'ai_advance',async()=>{
        book=await driveAiTurns(book,ids,bookCast);
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:await publicState(book,auth,ids,bookCast),advanced:true});
        });
      }

      if(url.pathname==='/novel2/api/book/new'){
        const blueprint=await createStoryBlueprint({creativeBrief:input.creative_brief||''});
        const draft=await createStoryDraft({title:blueprint.title,logline:blueprint.logline,blueprint});
        return send(res,200,{ok:true,draft});
      }

      if(url.pathname==='/novel2/api/book/exit'){
        if(!book)return send(res,200,{ok:true,state:await publicState(null,auth,ids,[])});
        const archived=await archiveBook(book.id,'user_exit');
        if(!archived)return send(res,409,{ok:false,error:'NOVEL2_BOOK_EXIT_FAILED'});
        return send(res,200,{ok:true,archived_book:{id:archived.id,title:archived.title},state:await publicState(null,auth,ids,[])});
      }

      if(url.pathname==='/novel2/api/start'){
        return send(res,410,{ok:false,error:'NOVEL2_USE_STORY_FIRST_FLOW'});
      }

      if(url.pathname==='/novel2/api/reply'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        assertExpectedTurn(book,input);
        if(book.current_scene?.noir_progress?.finale)return send(res,409,{ok:false,error:'NOVEL2_STORY_ALREADY_FINISHED'});
        if(String(book.active_role)!==auth.role||isAiControlled(ids,auth.role,bookCast))return send(res,409,{ok:false,error:'NOVEL2_NOT_YOUR_TURN'});
        const available=Array.isArray(book.current_scene?.optional_actions)?book.current_scene.optional_actions:[];
        const actionKey=String(input.action_key||'').trim();
        const selected=actionKey?available.find(a=>String(a.key)===actionKey):null;
        if(actionKey&&!selected)return send(res,400,{ok:false,error:'NOVEL2_ACTION_UNAVAILABLE'});
        const reply=String(input.reply||'').trim()||String(selected?.label||'').trim();
        if(reply.length<1||reply.length>3000)return send(res,400,{ok:false,error:'NOVEL2_REPLY_INVALID'});

        return await withBookPipelineLock(book.id,book.turn_no,'reply',async()=>{
        const replyTurn=Number(book.turn_no||0)+1;
        await appendTurn(book.id,replyTurn,auth.role,'reply',reply,{action_key:actionKey});
        const history=await recentTurns(book.id,18);
        const next=await continueStory({book,recentTurns:history,playerRole:auth.role,playerReply:reply,actionKey});
        book=await advanceBook(book,{scene:next.scene,canon:next.canon,activeRole:next.scene.target_role});
        // Return the committed scene immediately. Reader AI advancement is a
        // separate action and cannot hide a successful player-turn publication.
        ids=await identities();
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:await publicState(book,auth,ids,bookCast)});
        });
      }

      if(url.pathname==='/novel2/api/character/looks'){
        const targetRole=String(input.role||auth.role).toUpperCase();
        if(!['A','B'].includes(targetRole))return send(res,400,{ok:false,error:'NOVEL2_CHARACTER_ROLE_INVALID'});
        if(targetRole!==auth.role)return send(res,403,{ok:false,error:'NOVEL2_OTHER_PLAYER_PRIVATE'});
        const identity=ids[targetRole];
        if(!identity?.character_card?.passport)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_NOT_GENERATED'});
        const looks=await characterLooksForRole(targetRole,identity);
        return send(res,200,{ok:true,role:targetRole,looks});
      }

      if(url.pathname==='/novel2/api/character/look/generate'){
        const targetRole=String(input.role||auth.role).toUpperCase();
        const lookKey=String(input.look_key||'').trim();
        if(!['A','B'].includes(targetRole))return send(res,400,{ok:false,error:'NOVEL2_CHARACTER_ROLE_INVALID'});
        if(targetRole!==auth.role)return send(res,403,{ok:false,error:'NOVEL2_OTHER_PLAYER_PRIVATE'});
        const def=characterLookDefinition(lookKey);
        if(!def)return send(res,400,{ok:false,error:'NOVEL2_CHARACTER_LOOK_INVALID'});
        const identity=ids[targetRole];
        if(!identity?.character_card?.passport||!identity?.identity_lock)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_NOT_GENERATED'});
        await ensureCanonicalCharacterLook(targetRole,identity);
        const storyContext=book?{
          title:book.title||'',
          logline:String(book.story_bible?.logline||''),
          scene:String(book.current_scene?.prose||'').slice(0,1400)
        }:{};
        const generated=await generateCharacterLook({
          identity,
          role:targetRole,
          lookKey,
          storyContext
        });
        await saveCharacterLook({
          role:targetRole,
          lookKey,
          title:def.title,
          prompt:generated.prompt,
          model:generated.model,
          imageBase64:generated.base64,
          isPrimary:false
        });
        const looks=await characterLooksForRole(targetRole,identity);
        return send(res,200,{ok:true,role:targetRole,look:looks.find(x=>x.key===lookKey)||null,looks});
      }

      if(url.pathname==='/novel2/api/character/look/select'){
        const targetRole=String(input.role||auth.role).toUpperCase();
        const lookKey=String(input.look_key||'').trim();
        if(!['A','B'].includes(targetRole))return send(res,400,{ok:false,error:'NOVEL2_CHARACTER_ROLE_INVALID'});
        if(targetRole!==auth.role)return send(res,403,{ok:false,error:'NOVEL2_OTHER_PLAYER_PRIVATE'});
        if(!ids[targetRole]?.character_card?.passport)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_NOT_GENERATED'});
        await ensureCanonicalCharacterLook(targetRole,ids[targetRole]);
        await selectCharacterLook(targetRole,lookKey);
        ids=await identities();
        const looks=await characterLooksForRole(targetRole,ids[targetRole]);
        return send(res,200,{ok:true,role:targetRole,looks,state:await publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/character/save'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_SAVE_ONLY_BEFORE_START'});
        const targetRole=String(input.role||auth.role).toUpperCase();
        if(targetRole!==auth.role)return send(res,403,{ok:false,error:'NOVEL2_ONLY_OWN_PHOTO_CHARACTER_CAN_BE_SAVED'});
        const identity=ids[targetRole];
        if(!identity?.profile||!identity?.identity_lock||identity?.builder_meta?.synthetic){
          return send(res,409,{ok:false,error:'NOVEL2_PHOTO_CHARACTER_REQUIRED'});
        }
        await approveIdentity(targetRole);
        ids=await identities();
        return send(res,200,{ok:true,role:targetRole,state:await publicState(null,auth,ids,[])});
      }

      if(url.pathname==='/novel2/api/character/random'){
        return send(res,410,{ok:false,error:'NOVEL2_AI_CHARACTERS_ARE_CREATED_INSIDE_STORY'});
      }

      if(url.pathname==='/novel2/api/character/build'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        if(Array.isArray(input.reference_images)&&input.reference_images.length>4)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_MAX_FOUR_PHOTOS'});
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,4):[];
        if(refs.length<1)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_REFERENCES_REQUIRED'});
        // Photo saving and actor-sheet rendering do not require a flaky remote
        // vision-description request. The image model uses actual photo refs.
        const analyzed=referenceOnlyIdentity({role,referenceImages:refs});
        const baseActorCard=buildBaseActorCard({role,profile:analyzed.profile,sourcePhotoCount:refs.length});
        const builderMeta={
          synthetic:false,
          identity_only:true,
          no_story_characterization:true,
          control_mode:'human',
          reference_count:refs.length,
          coverage:analyzed.profile?.reference_coverage||{},
          created_at:new Date().toISOString(),
          version:'base-actor-identity-1'
        };
        const saved=await saveIdentity(role,{
          profile:analyzed.profile,
          characterCard:baseActorCard,
          builderMeta,
          identityLock:analyzed.identityLock,
          referenceImages:refs,
          approved:false
        });
        actorSheetJobs.delete(role);
        return send(res,200,{
          ok:true,
          character:baseActorCard,
          identity:{role,approved:false,version:saved.version,coverage:builderMeta.coverage,identity_only:true},
          calibration_required:true
        });
      }

      if(url.pathname==='/novel2/api/identity/analyze'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        if(Array.isArray(input.reference_images)&&input.reference_images.length>4)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_MAX_FOUR_PHOTOS'});
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,4):[];
        if(refs.length<1)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_REFERENCES_REQUIRED'});
        const analyzed=await analyzeIdentity({role,referenceImages:refs,userFacts:{}});
        const baseActorCard=buildBaseActorCard({role,profile:analyzed.profile,sourcePhotoCount:refs.length});
        const saved=await saveIdentity(role,{
          profile:analyzed.profile,
          characterCard:baseActorCard,
          builderMeta:{
            synthetic:false,
            identity_only:true,
            no_story_characterization:true,
            control_mode:'human',
            reference_count:refs.length,
            coverage:analyzed.profile?.reference_coverage||{},
            version:'base-actor-identity-1'
          },
          identityLock:analyzed.identityLock,
          referenceImages:refs,
          approved:false
        });
        return send(res,200,{ok:true,identity:{role,approved:false,version:saved.version,profile:saved.profile,identity_only:true},calibration_required:true});
      }

      if(url.pathname==='/novel2/api/identity/register'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        const profile=input.profile&&typeof input.profile==='object'?input.profile:{};
        if(Array.isArray(input.reference_images)&&input.reference_images.length>4)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_MAX_FOUR_PHOTOS'});
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,4):[];
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
        actorSheetJobs.delete(auth.role);
        return send(res,200,{ok:true,identity:{role:auth.role,approved:true,version:saved.version}});
      }

      if(url.pathname==='/novel2/api/identity/calibrate/prepare'){
        if(!serviceAuthenticated(req))return send(res,403,{ok:false,error:'NOVEL2_EDGE_PREPARE_DENIED'});
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        ids=await identities();
        const identity=ids[auth.role];
        if(!identity?.identity_lock)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_NOT_FOUND'});
        const {job,fresh}=beginEdgeActorJob(auth.role,{force:input.force===true});
        if(!fresh)return send(res,200,{ok:true,job:actorSheetJobView(job)});
        try{
          const {prompt,references}=calibrationSpec({identity,role:auth.role});
          const refs=await resizeReferences(references,480,4);
          if(!refs.length||refs.length!==references.length)
            throw new Error('NOVEL2_IMAGE_REFERENCES_MISSING');
          return send(res,200,{ok:true,job:actorSheetJobView(job),
            work:{job_id:job.jobId,role:auth.role,prompt,refs,width:832,height:1344}});
        }catch(error){
          job.status='failed';job.errorCode='GENERATION_REFERENCES_MISSING';job.finishedAt=Date.now();
          return send(res,422,{ok:false,error:job.errorCode});
        }
      }

      if(url.pathname==='/novel2/api/identity/calibrate/start'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        ids=await identities();
        const identity=ids[auth.role];
        if(!identity?.identity_lock)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_NOT_FOUND'});
        // Four isolated views must be scheduled through the Cloudflare Worker.
        // Do not allow the old one-pass multi-head renderer to run on the origin.
        return send(res,409,{ok:false,error:'NOVEL2_EDGE_ACTOR_WORKFLOW_REQUIRED'});
      }

      if(url.pathname==='/novel2/api/identity/calibrate/status'){
        const job=ids[auth.role]?.approved?null:actorSheetJobs.get(auth.role);
        markActorJobTimedOut(job);
        if(!job){
          // Recover a finished sheet after a container restart. An unfinished
          // in-memory job cannot be represented as still running after restart.
          const looks=await listCharacterLooks(auth.role);
          const saved=looks.find(row=>row.look_key==='canonical'&&row.image_base64&&row.model!=='existing');
          if(saved)return send(res,200,{ok:true,job:{
            status:'ready',phase:'done',started_at:null,finished_at:null,
            calibration:'data:image/jpeg;base64,'+saved.image_base64
          }});
        }
        return send(res,200,{ok:true,job:actorSheetJobView(job,true)});
      }

      if(url.pathname==='/novel2/api/identity/calibrate'){
        // Never run a one-shot four-person collage. The public Worker owns actor casting.
        return send(res,409,{ok:false,error:'NOVEL2_EDGE_ACTOR_WORKFLOW_REQUIRED'});
      }

      if(url.pathname==='/novel2/api/visual'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        bookCast=await getBookCast(book.id);
        if(!bookCast.length){
          ids=await identities();
          if(!ids.A?.approved||!ids.B?.approved)return send(res,409,{ok:false,error:'NOVEL2_IDENTITY_NOT_READY'});
          bookCast=[
            {slot_key:'A',source_type:'player',source_id:'A',display_name:ids.A.character_card?.passport?.fiction_name||'A',character_card:ids.A.character_card||{},visual_profile:ids.A.profile||{},identity_lock:ids.A.identity_lock||'',reference_images:ids.A.reference_images||[],interactive_role:'A',control_mode:'human'},
            {slot_key:'B',source_type:'player',source_id:'B',display_name:ids.B.character_card?.passport?.fiction_name||'B',character_card:ids.B.character_card||{},visual_profile:ids.B.profile||{},identity_lock:ids.B.identity_lock||'',reference_images:ids.B.reference_images||[],interactive_role:'B',control_mode:'human'}
          ];
        }

        const present=new Set(Array.isArray(book.current_scene?.visual_scene?.characters_present)?book.current_scene.visual_scene.characters_present.map(String):[]);
        for(let i=0;i<bookCast.length;i++){
          const entry=bookCast[i];
          if(entry.source_type!=='ai_library'||!present.has(String(entry.slot_key))||(Array.isArray(entry.reference_images)&&entry.reference_images.length))continue;
          const ai=await getAiCharacter(entry.source_id);
          const refs=await ensureAiCharacterReference(ai);
          if(refs.length){
            await updateBookCastReference(book.id,entry.slot_key,refs);
            entry.reference_images=refs;
          }
        }

        const visualKey='turn-'+String(book.turn_no||0);
        const cached=await getVisual(book.id,visualKey);
        if(cached?.image_base64)return send(res,200,{ok:true,cached:true,image:'data:image/jpeg;base64,'+cached.image_base64,model:cached.model,prompt:cached.prompt});
        const previous=await previousVisual(book.id,Number(book.turn_no||0));
        const generated=await generateVisual({scene:book.current_scene||{},cast:bookCast,previousVisual:previous||{}});
        await saveVisual({
          bookId:book.id,
          turnNo:Number(book.turn_no||0),
          visualKey,
          prompt:generated.prompt,
          model:generated.model,
          imageBase64:generated.base64,
          meta:{
            continuity:String(book.current_scene?.visual_beat||book.current_scene?.visual_scene?.camera_moment||'').slice(0,1200),
            visual_scene:book.current_scene?.visual_scene||{},
            cast:bookCast.map(x=>({slot_key:x.slot_key,source_type:x.source_type,source_id:x.source_id,display_name:x.display_name}))
          }
        });
        return send(res,200,{ok:true,cached:false,image:'data:image/jpeg;base64,'+generated.base64,model:generated.model,prompt:generated.prompt});
      }

      return send(res,404,{ok:false,error:'NOT_FOUND'});
    }catch(error){
      const pipelineCode=String(error?.message||'').match(/^NOVEL2_PIPELINE_[A-Z0-9_]+/)?.[0];
      if(pipelineCode){
        console.error('NOVEL2_REQUEST_FAILED',pipelineCode);
        return send(res,/BUSY|STALE_TURN|TURN_CONFLICT/.test(pipelineCode)?409:502,{ok:false,error:pipelineCode});
      }
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



