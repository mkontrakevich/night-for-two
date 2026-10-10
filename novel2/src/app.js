import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,assertProductionConfig} from './config.js';
import {authenticate} from './auth.js';
import {
  initDb,latestBook,listBooks,renameBook,deleteBook,activateBook,createBook,appendTurn,recentTurns,advanceBook,archiveBook,
  identities,saveIdentity,approveIdentity,
  createStoryDraft,getStoryDraft,listStoryDrafts,deleteStoryDraft,markStoryDraftUsed,
  saveBookCast,getBookCast,claimBookCastControl,updateBookCastReference,
  listCharacterLooks,saveCharacterLook,ensureCanonicalCharacterLook,selectCharacterLook,
  getVisual,previousVisual,saveVisual,db
} from './db.js';
import {createStoryBlueprint,createStoryBible,continueStory,generateAiCharacterReply} from './prose-engine.js';
import {analyzeIdentity,buildLock,buildBaseActorCard} from './identity-engine.js';
import {buildCharacterCard,buildSyntheticCharacter,normalizeCharacterCard} from './character-builder.js';
import {generateVisual,generateCalibration,generateSyntheticReference,generateCharacterLook,characterLookDefinition} from './visual-engine.js';
import {fetchRelationshipContext,sliceRelationshipContext,explicitGenderForRole} from './relationship-context.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const htmlPath=path.resolve(__dirname,'../public/index.html');

// One active generation per authenticated player. The task runs on the origin
// after the HTTP request ends; re-opening the Mini App can reconnect to it.
// The canonical result is committed to PostgreSQL before reporting success.
const actorSheetJobs=new Map();
function actorSheetJobView(job,includeResult=false){
  if(!job)return{status:'idle'};
  const view={status:job.status,phase:'actor_sheet',started_at:job.startedAt,finished_at:job.finishedAt||null,
    error_code:job.status==='failed'?job.errorCode:null};
  if(includeResult&&job.status==='ready')view.calibration=job.calibration;
  return view;
}
function launchActorSheetJob(role,identity){
  const existing=actorSheetJobs.get(role);
  if(existing?.status==='working')return existing;
  const job={status:'working',startedAt:Date.now(),finishedAt:null,errorCode:null,calibration:''};
  actorSheetJobs.set(role,job);
  void (async()=>{
    try{
      const calibration=await generateCalibration({identity,role});
      if(!calibration?.base64)throw new Error('NOVEL2_ACTOR_SHEET_EMPTY');
      await saveCharacterLook({
        role,lookKey:'canonical',title:'Нейтральная карточка актёра',
        prompt:calibration.prompt,model:calibration.model,
        imageBase64:calibration.base64,isPrimary:true
      });
      job.calibration='data:image/jpeg;base64,'+calibration.base64;
      job.status='ready';
    }catch(error){
      // Never expose reference photos, prompts, provider credentials or raw
      // upstream responses in the polling API or GitHub Actions logs.
      const message=String(error?.message||'');
      job.errorCode=/TIMEOUT|TRANSPORT|Abort|fetch failed/i.test(message)
        ?'GENERATION_CONNECTION_INTERRUPTED'
        :/EDGE_IMAGE|IMAGE_5\d\d|EMPTY_IMAGE/i.test(message)
          ?'GENERATION_PROVIDER_FAILED':'GENERATION_FAILED';
      job.status='failed';
      console.error('NOVEL2_ACTOR_SHEET_FAILED',job.errorCode);
    }finally{job.finishedAt=Date.now();}
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
  generateReference=false
}={}){
  const slotKey=String(slot?.slot_key||runtimeRole||'story-character').slice(0,60);
  const roleKey=String(runtimeRole||slotKey);
  const synthetic=await buildSyntheticCharacter({
    role:roleKey,
    counterpartCard,
    relationshipContext,
    genderHint,
    storyContext:storyContextForCast(draft,blueprint),
    roleBrief:slot
  });
  const identityLock=buildLock('story:'+String(draft?.id||'draft')+':'+roleKey,synthetic.visualProfile);
  let references=[];
  if(generateReference){
    const generated=await generateSyntheticReference({
      identity:{identity_lock:identityLock,character_card:synthetic.characterCard,reference_images:[]},
      role:synthetic.characterCard?.passport?.fiction_name||roleKey
    });
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
function castCharacterSummary(entry){
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
    avatar:String(Array.isArray(entry?.reference_images)&&entry.reference_images[0]||''),
    character_card:card
  };
}
function characterSummary(identity,role='A'){
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
    avatar:String(Array.isArray(identity?.reference_images)&&identity.reference_images[0]||''),
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
function publicState(book,auth,ids={},bookCast=[]){
  const summaries={A:characterSummary(ids.A,'A'),B:characterSummary(ids.B,'B')};
  const base={
    role:auth.role,
    identity:{A:Boolean(summaries.A.ready),B:Boolean(summaries.B.ready)},
    characters:summaries,
    my_character:ids[auth.role]?.profile
      ?buildBaseActorCard({role:auth.role,profile:ids[auth.role].profile,sourcePhotoCount:ids[auth.role]?.reference_images?.length||0})
      :null
  };
  if(!book)return{mode:'home',...base};
  const scene=book.current_scene||{};
  return{
    mode:'reader',
    ...base,
    book:{id:book.id,title:book.title,chapter_no:book.chapter_no,turn_no:book.turn_no},
    scene,
    active_role:book.active_role,
    active_control_mode:isAiControlled(ids,book.active_role,bookCast)?'ai':'human',
    cast:(Array.isArray(bookCast)?bookCast:[]).map(castCharacterSummary),
    can_reply:String(book.active_role)===String(auth.role)&&!isAiControlled(ids,book.active_role,bookCast)
  };
}
async function driveAiTurns(book,ids,bookCast=[],maxTurns=4){
  let current=book;
  for(let i=0;i<maxTurns&&current&&isAiControlled(ids,current.active_role,bookCast);i++){
    const role=current.active_role;
    const humanRole=role==='A'?'B':'A';
    const history=await recentTurns(current.id,18);
    const auto=await generateAiCharacterReply({
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
  if(current&&isAiControlled(ids,current.active_role,bookCast)) throw new Error('NOVEL2_AI_TURN_LOOP');
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
        return send(res,200,{ok:true,books,drafts});
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
        return send(res,200,{ok:true,deleted,state:publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/book/open'){
        const opened=await activateBook(input.book_id);
        if(!opened)return send(res,404,{ok:false,error:'NOVEL2_BOOK_NOT_FOUND'});
        book=opened;
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/ai-characters'||url.pathname==='/novel2/api/ai-character/avatar'){
        return send(res,410,{ok:false,error:'NOVEL2_AI_CHARACTERS_ARE_STORY_SCOPED'});
      }

      if(url.pathname==='/novel2/api/story/draft/new'){
        const blueprint=await createStoryBlueprint({creativeBrief:input.creative_brief||''});
        const draft=await createStoryDraft({title:blueprint.title,logline:blueprint.logline,blueprint});
        return send(res,200,{ok:true,draft});
      }

      if(url.pathname==='/novel2/api/story/drafts'){
        const drafts=await listStoryDrafts(12);
        return send(res,200,{ok:true,drafts});
      }

      if(url.pathname==='/novel2/api/state'){
        // State reads must stay fast and side-effect free. Never block app opening
        // on prose generation; AI-controlled turns advance through a separate
        // endpoint after the reader has rendered.
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/ai/advance'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        if(!isAiControlled(ids,book.active_role,bookCast)){
          return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast),advanced:false});
        }
        book=await driveAiTurns(book,ids,bookCast);
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast),advanced:true});
      }

      if(url.pathname==='/novel2/api/story/draft/launch'){
        const draft=await getStoryDraft(input.draft_id);
        if(!draft)return send(res,404,{ok:false,error:'NOVEL2_STORY_DRAFT_NOT_FOUND'});
        const blueprint=draft.blueprint||{};
        const slots=Array.isArray(blueprint.cast_slots)?blueprint.cast_slots:[];
        const interactive=slots.filter(x=>x?.interactive).slice(0,2);
        const support=slots.filter(x=>!x?.interactive).slice(0,6);
        if(interactive.length!==2)return send(res,400,{ok:false,error:'NOVEL2_STORY_INTERACTIVE_SLOTS_INVALID'});

        ids=await identities();
        const relationship=await fetchRelationshipContext();
        const assignments=input.assignments&&typeof input.assignments==='object'?input.assignments:{};
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
            if(runtimeRole===auth.role&&!humanReady)return send(res,409,{ok:false,error:'NOVEL2_CURRENT_PLAYER_CHARACTER_REQUIRED'});
            if(!humanReady){
              entry=await createStoryAiCastEntry({
                runtimeRole,
                slot,
                draft,
                blueprint,
                counterpartCard:playerCards[auth.role]||{},
                relationshipContext:sliceRelationshipContext(relationship,runtimeRole),
                genderHint:explicitGenderForRole(relationship,runtimeRole),
                generateReference:true
              });
            }else{
              const identityOnly=Boolean(identity?.profile&&identity?.identity_lock&&!identity?.builder_meta?.synthetic);
              const storyCard=identityOnly
                ?await buildCharacterCard({
                    role:runtimeRole,
                    visualProfile:identity.profile||{},
                    userFacts:{},
                    referenceCount:Array.isArray(identity.reference_images)?identity.reference_images.length:1,
                    relationshipContext:sliceRelationshipContext(relationship,runtimeRole),
                    storyContext:storyContextForCast(draft,blueprint),
                    roleBrief:slot
                  })
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
              generateReference:true
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
            generateReference:false
          });
          castEntries.push(entry);
          assignments[slot.slot_key]='story_ai:'+entry.slot_key;
        }

        const supportingCast=castEntries.filter(x=>!x.interactive_role).map(x=>({
          slot_key:x.slot_key,
          narrative_function:x.narrative_function,
          character_card:x.character_card
        }));
        const bible=await createStoryBible({
          characters:{A:playerCards.A,B:playerCards.B},
          supportingCast,
          blueprint,
          relationshipContext:relationship
        });

        if(book)await archiveBook(book.id,'new_book');
        book=await createBook({
          title:bible.title||draft.title,
          storyBible:bible,
          scene:bible.first_scene,
          activeRole:bible.first_scene.target_role
        });
        await saveBookCast(book.id,castEntries);
        await markStoryDraftUsed(draft.id,assignments);
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/book/new'){
        const blueprint=await createStoryBlueprint({creativeBrief:input.creative_brief||''});
        const draft=await createStoryDraft({title:blueprint.title,logline:blueprint.logline,blueprint});
        return send(res,200,{ok:true,draft});
      }

      if(url.pathname==='/novel2/api/book/exit'){
        if(!book)return send(res,200,{ok:true,state:publicState(null,auth,ids,[])});
        const archived=await archiveBook(book.id,'user_exit');
        if(!archived)return send(res,409,{ok:false,error:'NOVEL2_BOOK_EXIT_FAILED'});
        return send(res,200,{ok:true,archived_book:{id:archived.id,title:archived.title},state:publicState(null,auth,ids,[])});
      }

      if(url.pathname==='/novel2/api/start'){
        return send(res,410,{ok:false,error:'NOVEL2_USE_STORY_FIRST_FLOW'});
      }

      if(url.pathname==='/novel2/api/reply'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        if(String(book.active_role)!==auth.role||isAiControlled(ids,auth.role,bookCast))return send(res,409,{ok:false,error:'NOVEL2_NOT_YOUR_TURN'});
        const reply=String(input.reply||'').trim();
        if(reply.length<1||reply.length>3000)return send(res,400,{ok:false,error:'NOVEL2_REPLY_INVALID'});

        const replyTurn=Number(book.turn_no||0)+1;
        await appendTurn(book.id,replyTurn,auth.role,'reply',reply,{action_key:String(input.action_key||'')});
        const history=await recentTurns(book.id,18);
        const next=await continueStory({book,recentTurns:history,playerRole:auth.role,playerReply:reply,actionKey:String(input.action_key||'')});
        book=await advanceBook(book,{scene:next.scene,canon:next.canon,activeRole:next.scene.target_role});
        ids=await identities();
        book=await driveAiTurns(book,ids,bookCast);
        bookCast=await getBookCast(book.id);
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast)});
      }

      if(url.pathname==='/novel2/api/character/looks'){
        const targetRole=String(input.role||auth.role).toUpperCase();
        if(!['A','B'].includes(targetRole))return send(res,400,{ok:false,error:'NOVEL2_CHARACTER_ROLE_INVALID'});
        const identity=ids[targetRole];
        if(!identity?.character_card?.passport)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_NOT_GENERATED'});
        const looks=await characterLooksForRole(targetRole,identity);
        return send(res,200,{ok:true,role:targetRole,looks});
      }

      if(url.pathname==='/novel2/api/character/look/generate'){
        const targetRole=String(input.role||auth.role).toUpperCase();
        const lookKey=String(input.look_key||'').trim();
        if(!['A','B'].includes(targetRole))return send(res,400,{ok:false,error:'NOVEL2_CHARACTER_ROLE_INVALID'});
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
        if(!ids[targetRole]?.character_card?.passport)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_NOT_GENERATED'});
        await ensureCanonicalCharacterLook(targetRole,ids[targetRole]);
        await selectCharacterLook(targetRole,lookKey);
        ids=await identities();
        const looks=await characterLooksForRole(targetRole,ids[targetRole]);
        return send(res,200,{ok:true,role:targetRole,looks,state:publicState(book,auth,ids,bookCast)});
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
        return send(res,200,{ok:true,role:targetRole,state:publicState(null,auth,ids,[])});
      }

      if(url.pathname==='/novel2/api/character/random'){
        return send(res,410,{ok:false,error:'NOVEL2_AI_CHARACTERS_ARE_CREATED_INSIDE_STORY'});
      }

      if(url.pathname==='/novel2/api/character/build'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        const role=auth.role;
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
        if(refs.length<1)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_REFERENCES_REQUIRED'});
        const analyzed=await analyzeIdentity({role,referenceImages:refs,userFacts:{}});
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
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
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

      if(url.pathname==='/novel2/api/identity/calibrate/start'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        ids=await identities();
        const identity=ids[auth.role];
        if(!identity?.identity_lock)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_NOT_FOUND'});
        const job=launchActorSheetJob(auth.role,identity);
        return send(res,200,{ok:true,job:actorSheetJobView(job)});
      }

      if(url.pathname==='/novel2/api/identity/calibrate/status'){
        const job=actorSheetJobs.get(auth.role);
        return send(res,200,{ok:true,job:actorSheetJobView(job,true)});
      }

      if(url.pathname==='/novel2/api/identity/calibrate'){
        if(book)return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_REBUILD_ONLY_BEFORE_START'});
        ids=await identities();
        const identity=ids[auth.role];
        if(!identity)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_NOT_FOUND'});
        const calibration=await generateCalibration({identity,role:auth.role});
        await saveCharacterLook({
          role:auth.role,
          lookKey:'canonical',
          title:'Нейтральная карточка актёра',
          prompt:calibration.prompt,
          model:calibration.model,
          imageBase64:calibration.base64,
          isPrimary:true
        });
        return send(res,200,{ok:true,calibration:'data:image/jpeg;base64,'+calibration.base64,identity_only:true});
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
