import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,assertProductionConfig} from './config.js';
import {authenticate} from './auth.js';
import {
  initDb,latestBook,listBooks,renameBook,deleteBook,activateBook,createBook,appendTurn,recentTurns,advanceBook,archiveBook,
  identities,saveIdentity,approveIdentity,claimSyntheticControl,
  upsertAiCharacter,listAiCharacters,getAiCharacter,saveAiCharacterReference,
  createStoryDraft,getStoryDraft,listStoryDrafts,markStoryDraftUsed,
  saveBookCast,getBookCast,claimBookCastControl,updateBookCastReference,
  getVisual,previousVisual,saveVisual,db
} from './db.js';
import {createStoryBlueprint,createStoryBible,continueStory,generateAiCharacterReply} from './prose-engine.js';
import {analyzeIdentity,buildLock} from './identity-engine.js';
import {buildCharacterCard,buildSyntheticCharacter} from './character-builder.js';
import {generateVisual,generateCalibration,generateSyntheticReference} from './visual-engine.js';
import {fetchRelationshipContext,sliceRelationshipContext,explicitGenderForRole} from './relationship-context.js';
import {PRESET_AI_CHARACTERS} from './ai-character-library.js';

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
async function seedAiCharacterLibrary(){
  for(const preset of PRESET_AI_CHARACTERS){
    await upsertAiCharacter({
      id:preset.id,
      name:preset.card?.passport?.fiction_name||preset.id,
      tags:preset.tags||[],
      characterCard:preset.card,
      visualProfile:preset.profile,
      identityLock:buildLock(preset.id,preset.profile),
      referenceImages:[],
      source:'preset',
      enabled:true
    });
  }
}
function bookCastRole(bookCast=[],role){
  return (Array.isArray(bookCast)?bookCast:[]).find(x=>String(x?.interactive_role||'')===String(role))||null;
}
function castCharacterSummary(entry){
  const card=entry?.character_card||{};
  return{
    slot_key:String(entry?.slot_key||''),
    name:String(entry?.display_name||card?.passport?.fiction_name||''),
    story_role:String(card?.passport?.story_role||''),
    gender:String(card?.passport?.gender||''),
    source_type:String(entry?.source_type||''),
    source_id:String(entry?.source_id||''),
    interactive_role:entry?.interactive_role||null,
    control_mode:String(entry?.control_mode||'ai')
  };
}
function characterSummary(identity){
  const card=identity?.character_card||{};
  const meta=identity?.builder_meta||{};
  return{
    ready:Boolean(identity?.approved&&card?.passport),
    name:String(card?.passport?.fiction_name||''),
    archetype:String(card?.passport?.archetype||''),
    story_role:String(card?.passport?.story_role||''),
    gender:String(card?.passport?.gender||''),
    synthetic:Boolean(meta?.synthetic),
    control_mode:String(meta?.control_mode||'human'),
    relationship_grounded:Boolean(card?.behavioral_baseline?.relationship_grounded)
  };
}
function isAiControlled(ids,role,bookCast=[]){
  const castEntry=bookCastRole(bookCast,role);
  if(castEntry)return castEntry.control_mode==='ai';
  return Boolean(ids?.[role]?.approved&&ids?.[role]?.builder_meta?.synthetic&&ids?.[role]?.builder_meta?.control_mode==='ai');
}
function publicState(book,auth,ids={},bookCast=[]){
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
      characterCard:bookCastRole(bookCast,role)?.character_card||ids[role]?.character_card||{}
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
  await seedAiCharacterLibrary();
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
      if(book&&bookCastRole(bookCast,auth.role)?.control_mode==='ai'){
        await claimBookCastControl(book.id,auth.role);
        bookCast=await getBookCast(book.id);
      }else if(ids[auth.role]?.builder_meta?.synthetic&&ids[auth.role]?.builder_meta?.control_mode==='ai'){
        await claimSyntheticControl(auth.role);
        ids=await identities();
      }

      if(url.pathname==='/novel2/api/books'){
        const books=await listBooks(30);
        const drafts=await listStoryDrafts(12);
        return send(res,200,{ok:true,books,drafts});
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

      if(url.pathname==='/novel2/api/ai-characters'){
        const [characters,relationship]=await Promise.all([listAiCharacters(),fetchRelationshipContext()]);
        return send(res,200,{
          ok:true,
          role_gender_hints:{
            A:explicitGenderForRole(relationship,'A'),
            B:explicitGenderForRole(relationship,'B')
          },
          gender_hint_policy:'explicit_profile_only',
          characters:characters.map(x=>({
            id:x.id,
            name:x.name,
            gender:String(x.character_card?.passport?.gender||''),
            tags:x.tags,
            character_card:x.character_card,
            has_reference:Array.isArray(x.reference_images)&&x.reference_images.length>0
          }))
        });
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
        if(book){
          book=await driveAiTurns(book,ids,bookCast);
          bookCast=await getBookCast(book.id);
        }
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast)});
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
        const assignments=input.assignments&&typeof input.assignments==='object'?input.assignments:{};
        const castEntries=[];
        const playerCards={};
        const runtimeRoles=['A','B'];

        for(let i=0;i<2;i++){
          const slot=interactive[i];
          const runtimeRole=runtimeRoles[i];
          const token=String(assignments[slot.slot_key]||('player:'+runtimeRole));
          let entry=null;
          if(token==='player:'+runtimeRole){
            const identity=ids[runtimeRole];
            if(!identity?.approved||!identity?.character_card?.passport){
              return send(res,409,{ok:false,error:'NOVEL2_PLAYER_CHARACTER_REQUIRED:'+runtimeRole});
            }
            entry={
              slot_key:runtimeRole,
              narrative_function:String(slot.narrative_function||''),
              source_type:'player',
              source_id:runtimeRole,
              interactive_role:runtimeRole,
              display_name:identity.character_card.passport.fiction_name||runtimeRole,
              character_card:identity.character_card,
              visual_profile:identity.profile||{},
              identity_lock:identity.identity_lock||'',
              reference_images:identity.reference_images||[],
              control_mode:isAiControlled(ids,runtimeRole,[])?'ai':'human'
            };
          }else if(token.startsWith('ai:')){
            const ai=await getAiCharacter(token.slice(3));
            if(!ai)return send(res,404,{ok:false,error:'NOVEL2_AI_CHARACTER_NOT_FOUND'});
            entry={
              slot_key:runtimeRole,
              narrative_function:String(slot.narrative_function||''),
              source_type:'ai_library',
              source_id:ai.id,
              interactive_role:runtimeRole,
              display_name:ai.name,
              character_card:ai.character_card,
              visual_profile:ai.visual_profile||{},
              identity_lock:ai.identity_lock||'',
              reference_images:ai.reference_images||[],
              control_mode:'ai'
            };
          }else{
            return send(res,400,{ok:false,error:'NOVEL2_CAST_ASSIGNMENT_INVALID:'+slot.slot_key});
          }
          castEntries.push(entry);
          playerCards[runtimeRole]=entry.character_card;
        }

        // The authenticated participant must remain an interactive human lead.
        const ownEntry=castEntries.find(x=>x.interactive_role===auth.role);
        if(!ownEntry||ownEntry.control_mode!=='human'){
          return send(res,409,{ok:false,error:'NOVEL2_CURRENT_PLAYER_MUST_BE_HUMAN'});
        }

        const usedAi=new Set(castEntries.filter(x=>x.source_type==='ai_library').map(x=>x.source_id));
        const library=await listAiCharacters();
        for(let i=0;i<support.length;i++){
          const slot=support[i];
          let token=String(assignments[slot.slot_key]||'');
          if(!token){
            const fallback=library.find(x=>!usedAi.has(x.id))||library[i%Math.max(1,library.length)];
            if(fallback)token='ai:'+fallback.id;
          }
          if(!token.startsWith('ai:'))return send(res,400,{ok:false,error:'NOVEL2_SUPPORT_CAST_REQUIRED:'+slot.slot_key});
          const ai=await getAiCharacter(token.slice(3));
          if(!ai)return send(res,404,{ok:false,error:'NOVEL2_AI_CHARACTER_NOT_FOUND'});
          usedAi.add(ai.id);
          castEntries.push({
            slot_key:String(slot.slot_key||'').slice(0,60),
            narrative_function:String(slot.narrative_function||''),
            source_type:'ai_library',
            source_id:ai.id,
            interactive_role:null,
            display_name:ai.name,
            character_card:ai.character_card,
            visual_profile:ai.visual_profile||{},
            identity_lock:ai.identity_lock||'',
            reference_images:ai.reference_images||[],
            control_mode:'ai'
          });
        }

        const relationship=await fetchRelationshipContext();
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
        book=await driveAiTurns(book,ids,bookCast);
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
        ids=await identities();
        if(!ids.A?.approved||!ids.B?.approved||!ids.A?.character_card?.passport||!ids.B?.character_card?.passport){
          return send(res,409,{ok:false,error:'NOVEL2_CHARACTER_CARDS_REQUIRED'});
        }
        if(!book){
          const relationship=await fetchRelationshipContext();
          const bible=await createStoryBible({characters:{A:ids.A.character_card,B:ids.B.character_card},relationshipContext:relationship});
          book=await createBook({title:bible.title,storyBible:bible,scene:bible.first_scene,activeRole:bible.first_scene.target_role});
          await saveBookCast(book.id,[
            {slot_key:'A',narrative_function:'interactive protagonist',source_type:'player',source_id:'A',interactive_role:'A',display_name:ids.A.character_card.passport.fiction_name||'A',character_card:ids.A.character_card,visual_profile:ids.A.profile||{},identity_lock:ids.A.identity_lock||'',reference_images:ids.A.reference_images||[],control_mode:isAiControlled(ids,'A',[])?'ai':'human'},
            {slot_key:'B',narrative_function:'interactive protagonist',source_type:'player',source_id:'B',interactive_role:'B',display_name:ids.B.character_card.passport.fiction_name||'B',character_card:ids.B.character_card,visual_profile:ids.B.profile||{},identity_lock:ids.B.identity_lock||'',reference_images:ids.B.reference_images||[],control_mode:isAiControlled(ids,'B',[])?'ai':'human'}
          ]);
        }
        bookCast=await getBookCast(book.id);
        book=await driveAiTurns(book,ids,bookCast);
        return send(res,200,{ok:true,state:publicState(book,auth,ids,bookCast)});
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
          state:publicState(null,auth,ids,[])
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
          let refs=Array.isArray(ai?.reference_images)?ai.reference_images:[];
          if(!refs.length&&ai){
            const generatedRef=await generateSyntheticReference({
              identity:{identity_lock:ai.identity_lock,character_card:ai.character_card,reference_images:[]},
              role:ai.name||ai.id
            });
            const data='data:image/jpeg;base64,'+generatedRef.base64;
            await saveAiCharacterReference(ai.id,data);
            refs=[data];
          }
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
