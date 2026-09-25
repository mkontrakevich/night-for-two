import pg from 'pg';
import crypto from 'node:crypto';
import {NIGHT_V2_PACKS,nightV2Pack} from './night-for-two-v2-catalog.js';
import {negotiateNightV2,availableNightV2Packs,chooseNightV2Round,adjustNightV2Intensity,NIGHT_V2_INTIMATE_PERMISSIONS,NIGHT_V2_NIGHT_PACKS} from './night-for-two-v2-game.js';
import {createLoveStoryLearningEngine} from './integrations/app-learning-adapter.js';
import {createLoveStoryHarmonyDirector} from './integrations/app-harmony-adapter.js';
import {createLoveStoryEventFeedback} from './integrations/app-feedback-adapter.js';
import {createNightRelationshipBridge} from './integrations/relationship-context-connector.js';
import {simulateNightPartner} from './night-ai-test-partner.js';
import {compatibleSpace,normalizeChoice,generatePersonalIdea,rankNovelty,LEVELS as PERSONAL_LEVELS,VARIETY_MATRIX} from './night-core.js';
import {completeAIText} from './ai/provider-router.js';
import {generateStoryInterview,normalizeStoryAnswers,simulateStoryAnswers,storyModeCategories,storyModePermissions} from './night-story-interview.js';
import {generateStoryScene,simulateStoryChoice,initialStoryProfile,optionFor,applyStoryOption,mergeStoryProfiles,mergeDirectorSignals,storyProfileToSelection,storyArcStage,STORY_MAX_CHOICE_STAGE} from './night-story-flow.js';

const {Pool}=pg;
const SCOPE='couple_default';
const OWNER_ID=String(process.env.PRIMARY_OWNER_ID||'');
const PARTNER_ID=String(process.env.PARTNER_TELEGRAM_ID||'');
const LEVELS=new Set(['tender','bold','hot']);
const DURATIONS=new Set(['quick','session','open']);
const PERMISSIONS=new Set(['words','embrace','kiss','touch','massage','closer']);
const REACTIONS=new Set(['fire','love','ok','flat','avoid']);
const UI_THEMES=new Set(['dance','boudoir','domination','romance']);
const EVENING_MODES=new Set(['adaptive','romance','sensual','bold','hardcore']);
const MAX_ROUNDS=3;

export const NIGHT_V2_DISPLAY=Object.freeze({
  getting_closer:{title:'Снова впервые',hint:'Флирт, разговор и ощущение нового знакомства.'},
  tender:{title:'Медленный огонь',hint:'Нежность, внимание и спокойная близость.'},
  sex_basics:{title:'Чувствовать друг друга',hint:'Темп, инициатива и точная обратная связь.'},
  acrobatics:{title:'Новый угол',hint:'Новые положения без гонки за сложностью.'},
  super_acrobatics:{title:'Смелый ракурс',hint:'Более смелые варианты для опытной пары.'},
  his_week:{title:'В его ритме',hint:'Сегодня больше внимания его желаниям.'},
  her_week:{title:'В её ритме',hint:'Сегодня больше внимания её желаниям.'},
  home_fun:{title:'Дом после полуночи',hint:'Игра с пространством, музыкой и ролями.'},
  park:{title:'До возвращения домой',hint:'Флирт и ожидание на прогулке; интимное — только приватно.'},
  fetish_explore:{title:'Территория интереса',hint:'Безопасно исследовать фантазии и границы.'},
  new_sensations:{title:'Другие ощущения',hint:'Сенсорная игра, ожидание и новые впечатления.'},
  romance:{title:'Мы двое',hint:'Небольшие действия, которые возвращают близость.'},
  naughty:{title:'Без цензуры',hint:'Самый смелый режим — только внутри взаимного совпадения.'}
});

const schema=`
CREATE TABLE IF NOT EXISTS night_v2_sessions(
  id bigserial PRIMARY KEY,
  scope text NOT NULL DEFAULT 'couple_default',
  room_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','matching','selector','story','ready','active','feedback','complete','ended')),
  experience_id bigint,
  invited_user_id bigint,
  connection_nonce text NOT NULL DEFAULT '',
  connection_verified_at timestamptz,
  fingerprint_style text NOT NULL DEFAULT '',
  ui_theme text NOT NULL DEFAULT 'domination',
  evening_mode text NOT NULL DEFAULT 'adaptive',
  story_interview jsonb NOT NULL DEFAULT '{}'::jsonb,
  story_flow jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_pack_key text NOT NULL DEFAULT '',
  match_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  selector_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  negotiated_level text NOT NULL DEFAULT 'tender',
  ceiling integer NOT NULL DEFAULT 0,
  intensity integer NOT NULL DEFAULT 0,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  round_index integer NOT NULL DEFAULT 0,
  current_round jsonb NOT NULL DEFAULT '{}'::jsonb,
  used_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS invited_user_id bigint;
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS connection_nonce text NOT NULL DEFAULT '';
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS connection_verified_at timestamptz;
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS fingerprint_style text NOT NULL DEFAULT '';
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS ui_theme text NOT NULL DEFAULT 'domination';
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS evening_mode text NOT NULL DEFAULT 'adaptive';
ALTER TABLE night_v2_sessions ALTER COLUMN evening_mode SET DEFAULT 'adaptive';
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS story_interview jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE night_v2_sessions ADD COLUMN IF NOT EXISTS story_flow jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $night$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='night_v2_sessions'::regclass
      AND conname='night_v2_sessions_status_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%story%'
  ) THEN
    ALTER TABLE night_v2_sessions DROP CONSTRAINT night_v2_sessions_status_check;
    ALTER TABLE night_v2_sessions ADD CONSTRAINT night_v2_sessions_status_check CHECK(status IN ('waiting','matching','selector','story','ready','active','feedback','complete','ended'));
  END IF;
END
$night$;
CREATE INDEX IF NOT EXISTS night_v2_sessions_active_idx ON night_v2_sessions(scope,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS night_v2_players(
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES night_v2_sessions(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  role text NOT NULL CHECK(role IN ('A','B')),
  display_name text NOT NULL DEFAULT '',
  selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  selection_submitted boolean NOT NULL DEFAULT false,
  story_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  story_submitted boolean NOT NULL DEFAULT false,
  story_choice text NOT NULL DEFAULT '',
  reader_page integer NOT NULL DEFAULT 0,
  reader_scene_key text NOT NULL DEFAULT '',
  selector_choice text NOT NULL DEFAULT '',
  done_round integer NOT NULL DEFAULT -1,
  round_reaction text NOT NULL DEFAULT '',
  overall_reaction text NOT NULL DEFAULT '',
  connection_acknowledged boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,telegram_user_id),
  UNIQUE(session_id,role)
);
ALTER TABLE night_v2_players ADD COLUMN IF NOT EXISTS story_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE night_v2_players ADD COLUMN IF NOT EXISTS story_submitted boolean NOT NULL DEFAULT false;
ALTER TABLE night_v2_players ADD COLUMN IF NOT EXISTS story_choice text NOT NULL DEFAULT '';
ALTER TABLE night_v2_players ADD COLUMN IF NOT EXISTS reader_page integer NOT NULL DEFAULT 0;
ALTER TABLE night_v2_players ADD COLUMN IF NOT EXISTS reader_scene_key text NOT NULL DEFAULT '';
ALTER TABLE night_v2_players ADD COLUMN IF NOT EXISTS connection_acknowledged boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS night_v2_players_user_idx ON night_v2_players(telegram_user_id,active,updated_at DESC);

CREATE TABLE IF NOT EXISTS night_personal_ideas(
  id bigserial PRIMARY KEY,
  scope text NOT NULL DEFAULT 'couple_default',
  session_id bigint NOT NULL REFERENCES night_v2_sessions(id) ON DELETE CASCADE,
  round_index integer NOT NULL,
  signature text NOT NULL,
  fingerprint text NOT NULL,
  practice text NOT NULL,
  mechanic text NOT NULL,
  context text NOT NULL,
  semantic_summary text NOT NULL DEFAULT '',
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  reaction text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS night_personal_ideas_history_idx ON night_personal_ideas(scope,created_at DESC);
ALTER TABLE night_personal_ideas ADD COLUMN IF NOT EXISTS semantic_summary text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS night_personal_diagnostics(
  id bigserial PRIMARY KEY,
  scope text NOT NULL DEFAULT 'couple_default',
  session_id bigint NOT NULL REFERENCES night_v2_sessions(id) ON DELETE CASCADE,
  stage text NOT NULL,
  exception text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS night_private_wishes(
  scope text NOT NULL DEFAULT 'couple_default',
  telegram_user_id bigint NOT NULL,
  practice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,telegram_user_id,practice)
);

CREATE TABLE IF NOT EXISTS night_v2_round_feedback(
  session_id bigint NOT NULL REFERENCES night_v2_sessions(id) ON DELETE CASCADE,
  round_index integer NOT NULL,
  actor_role text NOT NULL CHECK(actor_role IN ('owner','partner')),
  task_key text NOT NULL,
  reaction text NOT NULL CHECK(reaction IN ('fire','love','ok','flat','avoid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,round_index,actor_role)
);
`;

function clean(v='',n=120){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function uniq(values=[]){return [...new Set((Array.isArray(values)?values:[]).map(v=>String(v||'')).filter(Boolean))];}
function isSyntheticUser(userId){return String(userId||'').startsWith('-');}
function roleForUser(userId){const id=String(userId||'');if(id===OWNER_ID)return'owner';if(id===PARTNER_ID)return'partner';if(isSyntheticUser(id))return'partner';return null;}
function otherUser(userId){return String(userId)===OWNER_ID?PARTNER_ID:OWNER_ID;}
function displayForPack(key){const pack=nightV2Pack(key);const d=NIGHT_V2_DISPLAY[key]||{};return {key:String(key||''),title:d.title||pack?.title||String(key||''),description:d.hint||pack?.description||'',heat:pack?.heat||1,length:pack?.length||0,icon:pack?.icon||'✨'};}
function nightCatalog(){return NIGHT_V2_PACKS.filter(pack=>NIGHT_V2_NIGHT_PACKS.has(pack.key)).map(pack=>displayForPack(pack.key));}
function categoriesObject(values=[]){return Object.fromEntries(uniq(values).map(key=>[key,'yes']));}
function syntheticChoiceAlignedTo(realInput={}){
  const real=normalizeChoice(realInput),maxLevel=Math.max(0,PERSONAL_LEVELS.indexOf(real.level)),blocked=new Set(real.boundaries||[]),allowed=new Set(real.permissions||[]);
  const score=row=>{
    let n=0;
    if((row.categories||[]).some(x=>real.categories.includes(x)))n+=20;
    if(['kiss','touch','massage','closer'].includes(row.permission))n+=8;
    n+=Math.max(0,5-Number(row.level||0));
    return n;
  };
  const rows=VARIETY_MATRIX.filter(row=>Number(row.level||0)<=maxLevel&&allowed.has(row.permission)&&!blocked.has(row.practice)).sort((a,b)=>score(b)-score(a));
  const row=rows[0];if(!row)return null;
  const overlap=(row.categories||[]).filter(x=>real.categories.includes(x));
  const categories=overlap.length?uniq([...overlap,...real.categories]).slice(0,3):uniq([...(row.categories||[]),...real.categories]).slice(0,3);
  return {version:3,...normalizeChoice({categories,tempo:real.tempo,level:real.level,permissions:real.permissions,boundaries:real.boundaries})};
}
function normalizeSelection(input={}){
  if(input.version===3)return {version:3,...normalizeChoice(input)};
  const categorySet=new Set(NIGHT_V2_PACKS.filter(x=>NIGHT_V2_NIGHT_PACKS.has(x.key)).map(x=>x.key));
  const level=LEVELS.has(String(input.level))?String(input.level):'tender';
  const duration=DURATIONS.has(String(input.duration))?String(input.duration):'quick';
  const categories=uniq(input.categories).filter(x=>categorySet.has(x)).slice(0,3);
  const permissions=uniq(input.permissions).filter(x=>PERMISSIONS.has(x));
  if(!categories.length)throw new Error('NIGHT_V2_CATEGORY_REQUIRED');
  if(!permissions.some(item=>NIGHT_V2_INTIMATE_PERMISSIONS.has(item)))throw new Error('NIGHT_V2_INTIMATE_PERMISSION_REQUIRED');
  return {level,duration,categories,permissions};
}
function reactionDirection(value){if(['flat','avoid'].includes(value))return'down';if(['fire','love'].includes(value))return'up';return'same';}
function reactionValue(value){return {fire:'repeat',love:'liked',ok:'liked',flat:'neutral',avoid:'avoid'}[value]||'neutral';}
function safeJson(v,fallback={}){if(v&&typeof v==='object')return v;try{return JSON.parse(String(v||''));}catch{return fallback;}}
function roomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<6;i++)out+=alphabet[Math.floor(Math.random()*alphabet.length)];return out;}
export const NIGHT_FINGERPRINT_POOLS=Object.freeze({
  romantic:Object.freeze(['❤️','💋','🌹','🕯️','🌙','🫦','🪶','🍓','🍒','✨','💎','🗝️','🖤','🤍','💞','💓','💗','🌺','🌸','🫶']),
  playful:Object.freeze(['😈','🍒','🍓','🫦','💋','🌶️','🔥','🍯','🍬','🎀','👠','🎭','🪞','🛏️','🛁','🚿','🧲','🫰','🐾','⚡','🕶️','🗝️']),
  spicy:Object.freeze(['🍑','🍆','💦','👅','🫦','🥵','😈','🔥','🌶️','🛏️','👠','🪢','⛓️','🖤','🍒','💋','🚿','🛁','🎭','🪞','🧨','🔗','🐾','🍯']),
  explicit:Object.freeze(['🍑','🍆','💦','👅','🫦','🥵','😈','🔥','⛓️','🪢','🛏️','👠','🎭','🪞','🚿','🛁','🌶️','🍒','👄','🧨','🔗','🐾','🫳','🧤','🍯','⚡'])
});
const FINGERPRINT_STYLES=Object.freeze(Object.keys(NIGHT_FINGERPRINT_POOLS));
export function connectionFingerprint({nonce='',roomCode='',ownerId=OWNER_ID,partnerId=PARTNER_ID}={}){
  if(!nonce||!roomCode)return null;
  const pair=[String(ownerId),String(partnerId)].sort().join(':');
  const digest=crypto.createHash('sha256').update(`night-connection:v1:${nonce}:${String(roomCode).toUpperCase()}:${pair}`).digest();
  const style=FINGERPRINT_STYLES[digest[0]%FINGERPRINT_STYLES.length],pool=NIGHT_FINGERPRINT_POOLS[style],symbols=[];
  for(let i=1;symbols.length<4&&i<digest.length;i++){let index=digest[i]%pool.length;for(let guard=0;guard<pool.length&&symbols.includes(pool[index]);guard++)index=(index+1)%pool.length;if(!symbols.includes(pool[index]))symbols.push(pool[index]);}
  return {style,symbols,code:digest.toString('hex').slice(0,12)};
}

export function createNightV2Runtime({pool=null}={}){
  const db=pool||new Pool({connectionString:process.env.DATABASE_URL});
  const ownsPool=!pool;
  const admins=new Set([OWNER_ID]);
  const learning=createLoveStoryLearningEngine({pool:db});
  const relationshipBridge=createNightRelationshipBridge({pool:db,scope:SCOPE});
  const harmony=createLoveStoryHarmonyDirector({learning,relationshipContext:()=>relationshipBridge.context(),catalog:NIGHT_V2_PACKS.filter(pack=>NIGHT_V2_NIGHT_PACKS.has(pack.key)).map(pack=>({...displayForPack(pack.key),mechanic:pack.mode||'session'}))});
  const eventFeedback=createLoveStoryEventFeedback({pool:db,admins,snezhaChatId:PARTNER_ID,learning});
  const storyJobs=new Map();

  function storyFlowOf(s){return safeJson(s?.story_flow,{});}
  async function storyContext(){
    const [relationshipProfile,director,mutual]=await Promise.all([
      relationshipBridge.context().catch(()=>({})),
      learning.directorContext().catch(()=>({})),
      mutualWishes().catch(()=>[])
    ]);
    return {relationshipProfile:{...relationshipProfile,director},mutualWishes:mutual};
  }
  async function prepareStoryScene(sessionId,{force=false}={}){
    const key='prepare:'+String(sessionId);
    if(storyJobs.has(key))return storyJobs.get(key);
    const job=(async()=>{
      try{
        const s=await session(sessionId);if(!s)return null;
        const current=storyFlowOf(s);
        if(!force&&current?.scene?.title)return current;
        const mode=String(s.evening_mode||'adaptive'),stage=Number(current.stage)||0,profile=current.profile||initialStoryProfile(mode),history=Array.isArray(current.history)?current.history:[],bookSeed=String(current.book_seed||crypto.randomBytes(18).toString('hex')),final=Boolean(current.final);
        const context=await storyContext();
        const scene=await generateStoryScene({mode,stage,profile,history,relationshipProfile:context.relationshipProfile,mutualWishes:context.mutualWishes,bookSeed,generate:request=>completeAIText(request),final});
        const next={version:1,book_seed:bookSeed,stage,profile,history,scene,final:Boolean(scene.final),generating:false,arc:storyArcStage(stage)};
        await db.query(`UPDATE night_v2_sessions SET story_flow=$2::jsonb,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify(next)]);
        await db.query(`UPDATE night_v2_players SET story_choice='',story_submitted=false,reader_page=0,reader_scene_key=$2,updated_at=now() WHERE session_id=$1`,[sessionId,`stage:${stage}:${scene.title}`]);
        const ps=await players(sessionId),synthetic=ps.find(p=>isSyntheticUser(p.telegram_user_id));
        if(synthetic&&!scene.final){
          const choice=await simulateStoryChoice({scene,relationshipProfile:context.relationshipProfile,generate:request=>completeAIText(request)});
          if(choice)await db.query(`UPDATE night_v2_players SET story_choice=$3,story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id),choice]);
        }else if(synthetic&&scene.final){
          await db.query(`UPDATE night_v2_players SET story_choice='complete',story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id)]);
        }
        console.log('NIGHT_STORY_SCENE_READY',JSON.stringify({session_id:sessionId,stage,final:Boolean(scene.final),test_mode:Boolean(synthetic)}));
        return next;
      }catch(error){
        const exception=String(error?.message||error).slice(0,240);
        console.error('NIGHT_STORY_SCENE_FAILED',JSON.stringify({session_id:sessionId,exception}));
        await db.query(`INSERT INTO night_personal_diagnostics(scope,session_id,stage,exception,state,api_trace) VALUES($1,$2,'storybook_scene',$3,$4::jsonb,'{}'::jsonb)`,[SCOPE,sessionId,exception,JSON.stringify({status:'story'})]).catch(()=>{});
        await db.query(`UPDATE night_v2_sessions SET story_flow=jsonb_set(COALESCE(story_flow,'{}'::jsonb),'{generating}','false'::jsonb,true),updated_at=now() WHERE id=$1`,[sessionId]).catch(()=>{});
        return null;
      }finally{storyJobs.delete(key);}
    })();
    storyJobs.set(key,job);
    return job;
  }
  function kickPrepareStory(sessionId,opts={}){void prepareStoryScene(sessionId,opts).catch(()=>{});}
  async function primeSyntheticStoryChoice(sessionId){
    const key='synthetic:'+String(sessionId);
    if(storyJobs.has(key))return storyJobs.get(key);
    const job=(async()=>{
      try{
        const s=await session(sessionId),flow=storyFlowOf(s),scene=flow.scene||{};if(!scene?.title)return null;
        const ps=await players(sessionId),synthetic=ps.find(p=>isSyntheticUser(p.telegram_user_id));if(!synthetic)return null;
        if(scene.final){await db.query(`UPDATE night_v2_players SET story_choice='complete',story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id)]);return 'complete';}
        if(synthetic.story_submitted&&synthetic.story_choice)return synthetic.story_choice;
        const relationshipProfile=await relationshipBridge.context().catch(()=>({}));
        const choice=await simulateStoryChoice({scene,relationshipProfile,generate:request=>completeAIText(request)}).catch(()=>scene.options?.[0]?.key||'');
        if(choice){
          await db.query(`UPDATE night_v2_players SET story_choice=$3,story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id),choice]);
          const ready=await players(sessionId);
          if(ready.length===2&&ready.every(p=>p.story_submitted)){
            const currentSession=await session(sessionId),currentFlow=storyFlowOf(currentSession);
            await db.query(`UPDATE night_v2_sessions SET story_flow=$2::jsonb,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify({...currentFlow,generating:true})]);
            void advanceStory(sessionId);
          }
        }
        return choice;
      }finally{storyJobs.delete(key);}
    })();
    storyJobs.set(key,job);return job;
  }
  function kickSyntheticStoryChoice(sessionId){void primeSyntheticStoryChoice(sessionId).catch(()=>{});}

  async function advanceStory(sessionId){
    const key='advance:'+String(sessionId);
    if(storyJobs.has(key))return storyJobs.get(key);
    const job=(async()=>{
      try{
        let s=await session(sessionId);if(!s||s.status!=='story')return s;
        const ps=await players(sessionId);if(ps.length<2||ps.some(p=>!p.story_submitted))return s;
        const flow=storyFlowOf(s),scene=flow.scene||{};if(!scene?.title||scene.final)return s;
        const a=ps.find(p=>p.role==='A'),b=ps.find(p=>p.role==='B'),optA=optionFor(scene,a?.story_choice),optB=optionFor(scene,b?.story_choice);
        if(!optA||!optB)throw new Error('NIGHT_STORY_CHOICE_INVALID');
        const mode=String(s.evening_mode||'adaptive'),baseProfile=flow.profile||initialStoryProfile(mode);
        const profileA=applyStoryOption(baseProfile,optA,mode),profileB=applyStoryOption(baseProfile,optB,mode),merged=mergeStoryProfiles(profileA,profileB,mode);
        const readerTail=Array.isArray(scene.reader_pages)&&scene.reader_pages.length?String(scene.reader_pages[scene.reader_pages.length-1]?.text||'').slice(-1200):'';const history=[...(Array.isArray(flow.history)?flow.history:[]),{stage:Number(flow.stage)||0,title:scene.title,text:scene.text,reader_tail:readerTail,merged_choice:[optA.key,optB.key],interaction_kind:String(scene.interaction?.kind||'choice'),director_signal:mergeDirectorSignals(optA,optB),profile:merged}].slice(-10);
        const nextStage=(Number(flow.stage)||0)+1,final=nextStage>STORY_MAX_CHOICE_STAGE;
        const generating={...flow,history,profile:merged,stage:nextStage,final,generating:true,scene:null,arc:storyArcStage(nextStage)};
        await db.query(`UPDATE night_v2_sessions SET story_flow=$2::jsonb,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify(generating)]);
        const context=await storyContext();
        const nextScene=await generateStoryScene({mode,stage:nextStage,profile:merged,history,relationshipProfile:context.relationshipProfile,mutualWishes:context.mutualWishes,bookSeed:String(flow.book_seed||''),generate:request=>completeAIText(request),final});
        const next={...generating,scene:nextScene,final:Boolean(nextScene.final),generating:false};
        await db.query(`UPDATE night_v2_sessions SET story_flow=$2::jsonb,selected_pack_key='personal',permissions=$3::jsonb,negotiated_level=$4,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify(next),JSON.stringify(merged.permissions||[]),String(merged.level||'familiar')]);
        await db.query(`UPDATE night_v2_players SET story_choice='',story_submitted=false,reader_page=0,reader_scene_key=$2,updated_at=now() WHERE session_id=$1`,[sessionId,`stage:${nextStage}:${nextScene.title}`]);
        const synthetic=ps.find(p=>isSyntheticUser(p.telegram_user_id));
        if(synthetic&&!nextScene.final){
          const choice=await simulateStoryChoice({scene:nextScene,relationshipProfile:context.relationshipProfile,generate:request=>completeAIText(request)});
          if(choice)await db.query(`UPDATE night_v2_players SET story_choice=$3,story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id),choice]);
        }else if(synthetic&&nextScene.final){
          await db.query(`UPDATE night_v2_players SET story_choice='complete',story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id)]);
        }
        console.log('NIGHT_STORY_ADVANCED',JSON.stringify({session_id:sessionId,stage:nextStage,final:Boolean(nextScene.final),choices:[optA.key,optB.key]}));
        return next;
      }catch(error){
        const exception=String(error?.message||error).slice(0,240);
        console.error('NIGHT_STORY_ADVANCE_FAILED',JSON.stringify({session_id:sessionId,exception}));
        await db.query(`INSERT INTO night_personal_diagnostics(scope,session_id,stage,exception,state,api_trace) VALUES($1,$2,'storybook_advance',$3,$4::jsonb,'{}'::jsonb)`,[SCOPE,sessionId,exception,JSON.stringify({status:'story'})]).catch(()=>{});
        await db.query(`UPDATE night_v2_sessions SET story_flow=jsonb_set(COALESCE(story_flow,'{}'::jsonb),'{generating}','false'::jsonb,true),updated_at=now() WHERE id=$1`,[sessionId]).catch(()=>{});
        return null;
      }finally{storyJobs.delete(key);}
    })();
    storyJobs.set(key,job);
    return job;
  }
  async function submitStoryChoice({userId,key}){
    const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');
    const s=await session(m.session_id);if(!s||s.status!=='story')throw new Error('NIGHT_STORY_NOT_ACTIVE');
    const flow=storyFlowOf(s),scene=flow.scene||{};if(!scene?.title||scene.final)throw new Error('NIGHT_STORY_CHOICE_NOT_AVAILABLE');
    const opt=optionFor(scene,key);if(!opt)throw new Error('NIGHT_STORY_CHOICE_INVALID');
    await db.query(`UPDATE night_v2_players SET story_choice=$3,story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId),String(opt.key)]);
    const ps=await players(s.id);
    if(ps.length===2&&ps.every(p=>p.story_submitted)){
      const marked={...flow,generating:true};
      await db.query(`UPDATE night_v2_sessions SET story_flow=$2::jsonb,updated_at=now() WHERE id=$1`,[s.id,JSON.stringify(marked)]);
      void advanceStory(s.id);
    }
    return view(userId);
  }
  async function saveReaderProgress({userId,page=0,sceneKey=''}){
    const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');
    const s=await session(m.session_id);if(!s||s.status!=='story')throw new Error('NIGHT_STORY_NOT_ACTIVE');
    const flow=storyFlowOf(s),scene=flow.scene||{},pages=Array.isArray(scene.reader_pages)?scene.reader_pages:[];
    if(!pages.length)throw new Error('NIGHT_READER_NOT_AVAILABLE');
    const currentKey=`stage:${Number(flow.stage)||0}:${String(scene.title||'')}`;
    if(sceneKey&&String(sceneKey)!==currentKey)throw new Error('NIGHT_READER_SCENE_CHANGED');
    const index=Math.max(0,Math.min(pages.length-1,Number(page)||0));
    await db.query(`UPDATE night_v2_players SET reader_page=$3,reader_scene_key=$4,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId),index,currentKey]);
    return {page:index,scene_key:currentKey};
  }
  async function finishStory({userId}){
    const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');
    const s=await session(m.session_id),flow=storyFlowOf(s);if(s?.status!=='story'||!flow?.scene?.final)throw new Error('NIGHT_STORY_FINAL_NOT_READY');
    await db.query(`UPDATE night_v2_players SET story_choice='complete',story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId)]);
    const ps=await players(s.id);if(ps.length===2&&ps.every(p=>p.story_submitted))await db.query(`UPDATE night_v2_sessions SET status='complete',completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1`,[s.id]);
    return view(userId);
  }

  async function personalHistory(){const {rows}=await db.query(`SELECT i.signature,i.fingerprint,i.practice,i.mechanic,i.context,i.semantic_summary,i.reaction FROM night_personal_ideas i WHERE i.scope=$1 ORDER BY i.created_at DESC LIMIT 300`,[SCOPE]);return rows;}
  async function mutualWishes(){const {rows}=await db.query(`SELECT practice FROM night_private_wishes WHERE scope=$1 AND telegram_user_id IN ($2,$3) GROUP BY practice HAVING count(DISTINCT telegram_user_id)=2`,[SCOPE,OWNER_ID,PARTNER_ID]);return rows.map(x=>x.practice);}
  async function privateWishes(userId){if(![OWNER_ID,PARTNER_ID].includes(String(userId)))throw new Error('NIGHT_V2_ACCESS_DENIED');await init();const {rows}=await db.query(`SELECT practice FROM night_private_wishes WHERE scope=$1 AND telegram_user_id=$2`,[SCOPE,String(userId)]);return rows.map(x=>x.practice);}
  async function saveWish({userId,practice}){if(![OWNER_ID,PARTNER_ID].includes(String(userId)))throw new Error('NIGHT_V2_ACCESS_DENIED');const key=String(practice||'');if(!VARIETY_MATRIX.some(x=>x.practice===key))throw new Error('NIGHT_WISH_INVALID');await init();const {rows}=await db.query(`INSERT INTO night_private_wishes(scope,telegram_user_id,practice) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING practice`,[SCOPE,String(userId),key]);if(!rows.length)await db.query(`DELETE FROM night_private_wishes WHERE scope=$1 AND telegram_user_id=$2 AND practice=$3`,[SCOPE,String(userId),key]);const matches=await mutualWishes();return {active:rows.length>0,matched:matches.includes(key)};}
  async function personalRound(s,roundIndex){
    const ps=await players(s.id),a=safeJson(ps.find(p=>p.role==='A')?.selection,{}),b=safeJson(ps.find(p=>p.role==='B')?.selection,{});
    const testMode=ps.some(p=>isSyntheticUser(p.telegram_user_id)),space=compatibleSpace(a,b),history=await personalHistory();
    const director=await learning.directorContext().catch(()=>({})),relationshipProfile=await relationshipBridge.context().catch(()=>({})),wishes=await mutualWishes(),storyInterview=safeJson(s.story_interview,{}),storyAnswers={a:safeJson(ps.find(p=>p.role==='A')?.story_answers,{}),b:safeJson(ps.find(p=>p.role==='B')?.story_answers,{})};
    const stage=roundIndex<=0?'warmup':roundIndex>=MAX_ROUNDS-1?'peak':'main';
    let idea,lastError=null,trace={request_name:'night_personal_idea',provider:'configured',request:{candidate_count:space.candidates.length,history_count:history.length,relationship_context:true,test_mode:testMode,evening_mode:s.evening_mode||'sensual',stage},response:{received:false}};
    for(let attempt=0;attempt<3&&!idea;attempt++){
      const preference={...director,relationshipProfile,mutualWishes:wishes,eveningMode:String(s.evening_mode||'adaptive'),stage,storyInterview,storyAnswers,noveltyNonce:crypto.randomBytes(12).toString('hex')};
      try{
        idea=await generatePersonalIdea({space,history,preferences:preference,generate:async request=>{trace.request_name=request.requestName;const response=await completeAIText(request);trace.response={received:true,characters:String(response||'').length,attempt:attempt+1};return response;}});
      }catch(error){lastError=error;trace.response={received:false,attempt:attempt+1,error:String(error?.message||error).slice(0,160)};}
    }
    if(!idea){
      const exception=String(lastError?.message||lastError||'NIGHT_GENERATION_FAILED').slice(0,240),state={status:s.status,session_id:s.id,round_index:roundIndex,ceiling:space.ceiling,permission_count:space.permissions.length,evening_mode:s.evening_mode||'sensual',stage,test_mode:testMode};
      const diagnostic=await db.query(`INSERT INTO night_personal_diagnostics(scope,session_id,stage,exception,state,api_trace) VALUES($1,$2,'generate',$3,$4::jsonb,$5::jsonb) RETURNING id`,[SCOPE,s.id,exception,JSON.stringify(state),JSON.stringify(trace)]).catch(()=>null);
      console.error('night_personal_generation_failed',JSON.stringify({stage:'generate',exception,diagnostic_id:diagnostic?.rows?.[0]?.id||null,state,api_trace:trace}));
      throw new Error('NIGHT_GENERATION_FAILED');
    }
    await db.query(`INSERT INTO night_personal_ideas(scope,session_id,round_index,signature,fingerprint,practice,mechanic,context,semantic_summary,categories) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,[SCOPE,s.id,roundIndex,idea.signature,idea.fingerprint,idea.practice,idea.mechanic,idea.context,idea.semanticSummary,JSON.stringify(idea.categories)]);
    const cue='Если что-то не подходит, остановитесь или нажмите «Другое» — приложение сгенерирует новый вариант внутри ваших текущих границ.';
    return {key:idea.signature,packKey:'personal',packTitle:'Сценарий вечера',heat:idea.level+1,leader:roundIndex%2?'b':'a',shared_task:{title:idea.title,text:idea.text},role_a:{title:idea.title,text:idea.text,cue},role_b:{title:idea.title,text:idea.text,cue},requires:space.permissions,signature:idea.signature,fingerprint:idea.fingerprint,practice:idea.practice,mechanic:idea.mechanic,context:idea.context,categories:idea.categories};
  }

  async function init(){await db.query(schema);await learning.init();await eventFeedback.init();return true;}
  async function membership(userId){const {rows}=await db.query(`SELECT p.*,s.status,s.room_code,s.experience_id FROM night_v2_players p JOIN night_v2_sessions s ON s.id=p.session_id WHERE p.telegram_user_id=$1 AND p.active=true AND s.status<>'ended' ORDER BY s.id DESC LIMIT 1`,[String(userId)]);return rows[0]||null;}
  async function players(sessionId){const {rows}=await db.query(`SELECT * FROM night_v2_players WHERE session_id=$1 AND active=true ORDER BY role`,[Number(sessionId)]);return rows;}
  async function session(sessionId){const {rows}=await db.query(`SELECT * FROM night_v2_sessions WHERE id=$1`,[Number(sessionId)]);return rows[0]||null;}
  async function ensureStoryInterview(s,safeSpace={},force=false){
    const current=safeJson(s?.story_interview,{});
    if(!force&&Array.isArray(current?.questions)&&current.questions.length>=3)return current;
    const relationshipProfile=await relationshipBridge.context().catch(()=>({}));
    const interview=await generateStoryInterview({
      mode:String(s?.evening_mode||'adaptive'),
      relationshipProfile,
      safeSpace,
      generate:request=>completeAIText(request)
    });
    await db.query(`UPDATE night_v2_sessions SET story_interview=$2::jsonb,updated_at=now() WHERE id=$1`,[s.id,JSON.stringify(interview)]);
    return interview;
  }
  async function isTestSession(sessionId){return (await players(sessionId)).some(p=>isSyntheticUser(p.telegram_user_id));}
  async function ensureExperience(executor,userId){const target=otherUser(userId);const payload={title:'Ночь вдвоём',text:'Приватный сценарий близкого вечера для двоих.',version:2};const {rows}=await executor.query(`INSERT INTO lovestory_experiences(scope,app_key,owner_chat_id,target_chat_id,proposal_kind,context_snapshot,payload,visibility,status,accepted_at) VALUES($1,'night',$2,$3,'night_v2','{}'::jsonb,$4::jsonb,'shared','accepted',now()) RETURNING id`,[SCOPE,String(userId),target,JSON.stringify(payload)]);return rows[0]?.id||null;}

  async function create({userId,name='',eveningMode='adaptive',theme=''}){await init();if(!roleForUser(userId)||isSyntheticUser(userId))throw new Error('NIGHT_V2_ACCESS_DENIED');const existing=await membership(userId);if(existing)return existing;const client=await db.connect();try{await client.query('BEGIN');let code='';for(let i=0;i<8;i++){code=roomCode();const exists=await client.query('SELECT 1 FROM night_v2_sessions WHERE room_code=$1',[code]);if(!exists.rowCount)break;}const mode=EVENING_MODES.has(String(eveningMode))?String(eveningMode):'adaptive',visualTheme=UI_THEMES.has(String(theme))?String(theme):({adaptive:'boudoir',romance:'romance',sensual:'boudoir',bold:'domination',hardcore:'domination'}[mode]||'boudoir');const invitedUserId=otherUser(userId),nonce=crypto.randomBytes(32).toString('hex'),fingerprint=connectionFingerprint({nonce,roomCode:code,ownerId:userId,partnerId:invitedUserId});const experienceId=await ensureExperience(client,userId),initialFlow={version:1,book_seed:crypto.randomBytes(18).toString('hex'),stage:0,profile:initialStoryProfile(mode),history:[],scene:null,final:false,generating:true,arc:storyArcStage(0)};const s=(await client.query(`INSERT INTO night_v2_sessions(scope,room_code,status,experience_id,invited_user_id,connection_nonce,fingerprint_style,ui_theme,evening_mode,story_flow) VALUES($1,$2,'waiting',$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,[SCOPE,code,experienceId,invitedUserId,nonce,fingerprint?.style||'',visualTheme,mode,JSON.stringify(initialFlow)])).rows[0];const p=(await client.query(`INSERT INTO night_v2_players(session_id,telegram_user_id,role,display_name,connection_acknowledged) VALUES($1,$2,'A',$3,false) RETURNING *`,[s.id,String(userId),clean(name,80)])).rows[0];await client.query('COMMIT');kickPrepareStory(s.id,{force:true});return {...p,status:s.status,room_code:s.room_code,experience_id:experienceId,invited_user_id:invitedUserId,evening_mode:mode};}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}
    async function join({userId,name='',code=''}){await init();if(!roleForUser(userId)||isSyntheticUser(userId))throw new Error('NIGHT_V2_ACCESS_DENIED');const current=await membership(userId);if(current)return current;const client=await db.connect();try{await client.query('BEGIN');const s=(await client.query(`SELECT * FROM night_v2_sessions WHERE room_code=$1 FOR UPDATE`,[String(code||'').trim().toUpperCase()])).rows[0];if(!s||s.status!=='waiting')throw new Error('NIGHT_V2_ROOM_NOT_AVAILABLE');const existing=(await client.query(`SELECT * FROM night_v2_players WHERE session_id=$1 ORDER BY role`,[s.id])).rows;if(existing.length>=2)throw new Error('NIGHT_V2_ROOM_FULL');const invited=String(s.invited_user_id||otherUser(existing[0]?.telegram_user_id||''));if(String(userId)!==invited)throw new Error('NIGHT_V2_ACCESS_DENIED');let nonce=String(s.connection_nonce||'');if(!nonce){nonce=crypto.randomBytes(32).toString('hex');const fp=connectionFingerprint({nonce,roomCode:s.room_code,ownerId:existing[0]?.telegram_user_id||OWNER_ID,partnerId:userId});await client.query(`UPDATE night_v2_sessions SET connection_nonce=$2,fingerprint_style=$3,updated_at=now() WHERE id=$1`,[s.id,nonce,fp?.style||'']);}const p=(await client.query(`INSERT INTO night_v2_players(session_id,telegram_user_id,role,display_name,connection_acknowledged) VALUES($1,$2,'B',$3,false) RETURNING *`,[s.id,String(userId),clean(name,80)])).rows[0];await client.query(`UPDATE night_v2_sessions SET status='story',connection_verified_at=now(),updated_at=now() WHERE id=$1`,[s.id]);await client.query('COMMIT');kickPrepareStory(s.id);return {...p,status:'story',room_code:s.room_code,experience_id:s.experience_id};}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}
  async function acknowledgeConnection({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');await db.query(`UPDATE night_v2_players SET connection_acknowledged=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[m.session_id,String(userId)]);const s=await session(m.session_id);if(s?.status==='story'&&!storyFlowOf(s)?.scene?.title)kickPrepareStory(s.id);return view(userId);}

  function selectionForHarmony(row){const s=safeJson(row.selection,{});return {categories:categoriesObject(s.categories),intensity:s.level||'tender',duration:s.duration||'quick'};}
  async function usableOptions(negotiated,keys=[]){const available=availableNightV2Packs({level:negotiated.ceiling,permissions:negotiated.permissions});const set=new Set(available.map(x=>x.key));return uniq(keys).filter(key=>set.has(key)).map(displayForPack);}
  async function reconcileSelections(sessionId){
    const ps=await players(sessionId);if(ps.length<2||ps.some(p=>!p.selection_submitted))return null;const testMode=ps.some(p=>isSyntheticUser(p.telegram_user_id));const s=await session(sessionId);if(!s||!['matching','selector'].includes(s.status))return s;const a=ps.find(p=>p.role==='A'),b=ps.find(p=>p.role==='B'),sa=safeJson(a.selection,{}),sb=safeJson(b.selection,{});const negotiated=negotiateNightV2({level:sa.level,permissions:sa.permissions},{level:sb.level,permissions:sb.permissions});
    if(sa.version===3||sb.version===3){
      if(sa.version!==3||sb.version!==3){await db.query(`UPDATE night_v2_sessions SET status='matching',match_payload='{"kind":"version_mismatch"}'::jsonb,updated_at=now() WHERE id=$1`,[sessionId]);return session(sessionId);}
      let va=sa,vb=sb,space=compatibleSpace(va,vb);
      if(!space.candidates.length&&testMode){
        const synthetic=ps.find(p=>isSyntheticUser(p.telegram_user_id)),real=ps.find(p=>!isSyntheticUser(p.telegram_user_id));
        const realChoice=safeJson(real?.selection,{}),aligned=realChoice?.version===3?syntheticChoiceAlignedTo(realChoice):null;
        if(synthetic&&aligned){
          await db.query(`UPDATE night_v2_players SET selection=$3::jsonb,selection_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id),JSON.stringify(aligned)]);
          if(synthetic.role==='A')va=aligned;else vb=aligned;
          space=compatibleSpace(va,vb);
          console.log('NIGHT_AI_SELECTION_ALIGNED',JSON.stringify({session_id:sessionId,candidate_count:space.candidates.length,permission_count:space.permissions.length}));
        }
      }
      if(!space.candidates.length){await db.query(`UPDATE night_v2_sessions SET status='matching',match_payload=$2::jsonb,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify({kind:'no_safe',categories:space.sharedCategories||[],permissions:space.permissions||[]})]);return session(sessionId);}
      const safeMatch={kind:'personal',categories:space.sharedCategories,tempoDifferent:space.tempos[0]!==space.tempos[1]};
      const interview=await ensureStoryInterview(s,space,true);
      await db.query(`UPDATE night_v2_sessions SET status='story',selected_pack_key='personal',match_payload=$2::jsonb,negotiated_level=$3,ceiling=$4,intensity=$4,permissions=$5::jsonb,story_interview=$6::jsonb,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify(safeMatch),PERSONAL_LEVELS[space.ceiling],space.ceiling,JSON.stringify(space.permissions),JSON.stringify(interview)]);
      if(testMode){
        const synthetic=ps.find(p=>isSyntheticUser(p.telegram_user_id));
        if(synthetic){
          const relationshipProfile=await relationshipBridge.context().catch(()=>({}));
          const storyAnswers=await simulateStoryAnswers({interview,relationshipProfile,generate:request=>completeAIText(request)});
          await db.query(`UPDATE night_v2_players SET story_answers=$3::jsonb,story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id),JSON.stringify(storyAnswers)]);
        }
      }else{
        for(const p of [a,b]){const choice=safeJson(p.selection,{}),role=roleForUser(p.telegram_user_id);for(const key of choice.categories)await learning.recordPrivateChoice({actor_role:role,source_app:'night',key,value:'yes',source_id:`night:${sessionId}`});await learning.recordPrivateChoice({actor_role:role,source_app:'night',kind:'intensity_choice',key:'level',value:choice.level,source_id:`night:${sessionId}`});await learning.recordPrivateChoice({actor_role:role,source_app:'night',kind:'duration_choice',key:'tempo',value:choice.tempo,source_id:`night:${sessionId}`});for(const key of choice.permissions)await learning.recordPrivateChoice({actor_role:role,source_app:'night',kind:'permission_choice',key,value:'yes',source_id:`night:${sessionId}`});for(const key of choice.boundaries)await learning.recordPrivateChoice({actor_role:role,source_app:'night',kind:'boundary_choice',key,value:'no',source_id:`night:${sessionId}`});}
        await learning.rebuild().catch(()=>{});
      }
      return session(sessionId);
    }
    if(s.status==='matching'){
      const ranked=await harmony.rankCompromise({a:selectionForHarmony(a),b:selectionForHarmony(b),sourceApp:'night'});const matchKeys=(ranked.matches||[]).map(x=>x.key),direct=await usableOptions(negotiated,matchKeys);
      if(direct.length){const selected=direct[0];await db.query(`UPDATE night_v2_sessions SET status='ready',selected_pack_key=$2,match_payload=$3::jsonb,selector_options='[]'::jsonb,negotiated_level=$4,ceiling=$5,intensity=$5,permissions=$6::jsonb,updated_at=now() WHERE id=$1`,[sessionId,selected.key,JSON.stringify({matches:direct,kind:'direct'}),negotiated.level,negotiated.ceiling,JSON.stringify(negotiated.permissions)]);if(!testMode)await harmony.recordResolution({sourceApp:'night',aRole:roleForUser(a.telegram_user_id)||'owner',bRole:roleForUser(b.telegram_user_id)||'partner',a:selectionForHarmony(a),b:selectionForHarmony(b),selectedKey:selected.key,sourceId:`night:${sessionId}`}).catch(()=>{});return session(sessionId);}
      const rankedKeys=(ranked.selector||[]).map(x=>x.key);let options=await usableOptions(negotiated,rankedKeys);if(!options.length){const fallback=availableNightV2Packs({level:negotiated.ceiling,permissions:negotiated.permissions}).slice(0,3);options=fallback.map(x=>displayForPack(x.key));}if(!options.length)throw new Error('NIGHT_V2_NO_SAFE_OPTIONS');const hints=new Map((ranked.selector||[]).map(x=>[x.key,x.hint]));options=options.map((o,i)=>({...o,hint:clean(hints.get(o.key)||['Ближе к вашим сегодняшним выборам','Чуть больше игры','Более спокойный общий вариант'][i]||'Совместимый вариант',140)}));await db.query(`UPDATE night_v2_sessions SET status='selector',selector_options=$2::jsonb,match_payload=$3::jsonb,negotiated_level=$4,ceiling=$5,intensity=$5,permissions=$6::jsonb,updated_at=now() WHERE id=$1`,[sessionId,JSON.stringify(options),JSON.stringify({matches:[],kind:'selector'}),negotiated.level,negotiated.ceiling,JSON.stringify(negotiated.permissions)]);return session(sessionId);
    }
    if(s.status==='selector'){
      const synthetic=ps.find(p=>isSyntheticUser(p.telegram_user_id)),real=ps.find(p=>!isSyntheticUser(p.telegram_user_id));if(testMode&&synthetic&&real?.selector_choice&&!synthetic.selector_choice)await db.query(`UPDATE night_v2_players SET selector_choice=$3,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(synthetic.telegram_user_id),String(real.selector_choice)]);const refreshed=await players(sessionId);if(!refreshed.every(p=>String(p.selector_choice||'')))return s;const aa=refreshed.find(p=>p.role==='A'),bb=refreshed.find(p=>p.role==='B'),options=safeJson(s.selector_options,[]),order=new Map(options.map((x,i)=>[x.key,i]));const choices=[aa.selector_choice,bb.selector_choice].filter(x=>order.has(x));if(!choices.length)throw new Error('NIGHT_V2_SELECTOR_INVALID');let key=choices[0];if(choices.length>1&&choices[0]!==choices[1])key=[...new Set(choices)].sort((x,y)=>(nightV2Pack(x)?.heat||9)-(nightV2Pack(y)?.heat||9)||(order.get(x)||0)-(order.get(y)||0))[0];const selected=displayForPack(key);await db.query(`UPDATE night_v2_sessions SET status='ready',selected_pack_key=$2,match_payload=$3::jsonb,updated_at=now() WHERE id=$1`,[sessionId,key,JSON.stringify({matches:[selected],kind:'compromise'})]);if(!testMode)await harmony.recordResolution({sourceApp:'night',aRole:roleForUser(aa.telegram_user_id)||'owner',bRole:roleForUser(bb.telegram_user_id)||'partner',a:selectionForHarmony(aa),b:selectionForHarmony(bb),selectedKey:key,sourceId:`night:${sessionId}`}).catch(()=>{});return session(sessionId);
    }
    return s;
  }

  async function submitSelection({userId,selection}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const normalized=normalizeSelection(selection);await db.query(`UPDATE night_v2_players SET selection=$3::jsonb,selection_submitted=true,story_answers='{}'::jsonb,story_submitted=false,selector_choice='',updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[m.session_id,String(userId),JSON.stringify(normalized)]);await reconcileSelections(m.session_id);const resolved=await session(m.session_id);console.log('NIGHT_PIPELINE_SAFETY',JSON.stringify({session_id:m.session_id,user_id:String(userId),next_status:resolved?.status||'',match_kind:safeJson(resolved?.match_payload,{}).kind||'',test_mode:await isTestSession(m.session_id)}));return view(userId);}
  async function reconcileStory(sessionId){const s=await session(sessionId);if(!s||s.status!=='story')return s;const ps=await players(sessionId);if(ps.length<2||ps.some(p=>!p.story_submitted))return s;await db.query(`UPDATE night_v2_sessions SET status='ready',updated_at=now() WHERE id=$1`,[sessionId]);return session(sessionId);}
  async function submitStoryAnswers({userId,answers}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.status!=='story')throw new Error('NIGHT_STORY_NOT_ACTIVE');const interview=safeJson(s.story_interview,{}),normalized=normalizeStoryAnswers(answers||{},interview);if(Object.keys(normalized).length!==(interview.questions||[]).length)throw new Error('NIGHT_STORY_ANSWERS_REQUIRED');await db.query(`UPDATE night_v2_players SET story_answers=$3::jsonb,story_submitted=true,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId),JSON.stringify(normalized)]);await reconcileStory(s.id);const resolved=await session(s.id);console.log('NIGHT_PIPELINE_STORY',JSON.stringify({session_id:s.id,user_id:String(userId),next_status:resolved?.status||'',test_mode:await isTestSession(s.id)}));if(resolved?.status==='ready'&&await isTestSession(s.id))return start({userId});return view(userId);}
  async function retrySelection({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');await db.query(`UPDATE night_v2_players SET selection='{}'::jsonb,selection_submitted=false,story_answers='{}'::jsonb,story_submitted=false,selector_choice='',updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[m.session_id,String(userId)]);await db.query(`UPDATE night_v2_players SET story_answers='{}'::jsonb,story_submitted=false,updated_at=now() WHERE session_id=$1`,[m.session_id]);await db.query(`UPDATE night_v2_sessions SET status='matching',selected_pack_key='',match_payload='{"kind":"retry"}'::jsonb,selector_options='[]'::jsonb,story_interview='{}'::jsonb,updated_at=now() WHERE id=$1`,[m.session_id]);return view(userId);}
  async function selectCompromise({userId,key}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.status!=='selector')throw new Error('NIGHT_V2_SELECTOR_NOT_ACTIVE');const options=safeJson(s.selector_options,[]);if(!options.some(x=>x.key===String(key)))throw new Error('NIGHT_V2_SELECTOR_INVALID');await db.query(`UPDATE night_v2_players SET selector_choice=$3,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[m.session_id,String(userId),String(key)]);await reconcileSelections(m.session_id);return view(userId);}
  async function start({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.status!=='ready'&&s?.status!=='active')throw new Error('NIGHT_V2_NOT_READY');if(s.status==='active')return view(userId);const round=s.selected_pack_key==='personal'?await personalRound(s,0):chooseNightV2Round({packKey:s.selected_pack_key,roundIndex:0,level:s.ceiling,permissions:safeJson(s.permissions,[]),usedKeys:[]});if(!round)throw new Error('NIGHT_V2_NO_SAFE_TASK');await db.query(`UPDATE night_v2_sessions SET status='active',round_index=0,current_round=$2::jsonb,used_keys=$3::jsonb,updated_at=now() WHERE id=$1`,[s.id,JSON.stringify(round),JSON.stringify([round.key])]);await db.query(`UPDATE night_v2_players SET done_round=-1,round_reaction='',updated_at=now() WHERE session_id=$1`,[s.id]);return view(userId);}
  async function markDone({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.status!=='active')throw new Error('NIGHT_V2_TASK_NOT_ACTIVE');await db.query(`UPDATE night_v2_players SET done_round=$3,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId),s.round_index]);let ps=await players(s.id);if(ps.some(p=>isSyntheticUser(p.telegram_user_id)))await db.query(`UPDATE night_v2_players SET done_round=$2,updated_at=now() WHERE session_id=$1 AND telegram_user_id<0`,[s.id,s.round_index]);ps=await players(s.id);if(ps.length===2&&ps.every(p=>Number(p.done_round)===Number(s.round_index)))await db.query(`UPDATE night_v2_sessions SET status='feedback',updated_at=now() WHERE id=$1`,[s.id]);return view(userId);}
  async function changeTask({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(!['active','feedback'].includes(s?.status))throw new Error('NIGHT_V2_TASK_NOT_ACTIVE');const used=safeJson(s.used_keys,[]),roundIndex=Number(s.round_index);const round=s.selected_pack_key==='personal'?await personalRound(s,roundIndex):chooseNightV2Round({packKey:s.selected_pack_key,roundIndex,level:s.ceiling,permissions:safeJson(s.permissions,[]),usedKeys:used});if(!round)throw new Error('NIGHT_V2_NO_SAFE_TASK');await db.query(`UPDATE night_v2_sessions SET status='active',current_round=$2::jsonb,used_keys=$3::jsonb,updated_at=now() WHERE id=$1`,[s.id,JSON.stringify(round),JSON.stringify([...used,round.key])]);await db.query(`UPDATE night_v2_players SET done_round=-1,round_reaction='',updated_at=now() WHERE session_id=$1`,[s.id]);return view(userId);}

  async function rateRound({userId,reaction}){if(!REACTIONS.has(String(reaction)))throw new Error('NIGHT_V2_REACTION_INVALID');const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.status!=='feedback')throw new Error('NIGHT_V2_FEEDBACK_NOT_ACTIVE');const actor=roleForUser(userId);if(!actor)throw new Error('NIGHT_V2_ACCESS_DENIED');const task=safeJson(s.current_round,{});await db.query(`INSERT INTO night_v2_round_feedback(session_id,round_index,actor_role,task_key,reaction) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,round_index,actor_role) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=now()`,[s.id,s.round_index,actor,task.key||'',String(reaction)]);await db.query(`UPDATE night_v2_players SET round_reaction=$3,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId),String(reaction)]);let ps=await players(s.id),testMode=ps.some(p=>isSyntheticUser(p.telegram_user_id));if(testMode)await db.query(`UPDATE night_v2_players SET round_reaction='ok',updated_at=now() WHERE session_id=$1 AND telegram_user_id<0`,[s.id]);else await learning.recordOutcome({actor_role:actor,source_app:'night',key:task.key||s.selected_pack_key,value:reactionValue(reaction),source_id:`night:${s.id}:round:${s.round_index}:${actor}`,metadata:{session_id:s.id,round_index:s.round_index,pack_key:s.selected_pack_key,...(s.selected_pack_key==='personal'?{practice:task.practice,mechanic:task.mechanic,context:task.context,categories:task.categories,novelty_signature:task.signature}:{})}}).catch(()=>{});ps=await players(s.id);if(ps.length===2&&ps.every(p=>REACTIONS.has(String(p.round_reaction)))){if(s.selected_pack_key==='personal'){const summary=ps.some(p=>['flat','avoid'].includes(p.round_reaction))?'no':ps.some(p=>p.round_reaction==='fire')?'more':'liked';await db.query(`UPDATE night_personal_ideas SET reaction=$3 WHERE session_id=$1 AND round_index=$2 AND fingerprint=$4 AND reaction=''`,[s.id,s.round_index,summary,task.fingerprint]);}const nextIntensity=s.selected_pack_key==='personal'?s.intensity:adjustNightV2Intensity({current:s.intensity,ceiling:s.ceiling,a:reactionDirection(ps.find(p=>p.role==='A')?.round_reaction),b:reactionDirection(ps.find(p=>p.role==='B')?.round_reaction)});if(Number(s.round_index)+1>=MAX_ROUNDS){await completeSession(s.id,nextIntensity);}else{const used=safeJson(s.used_keys,[]),nextIndex=Number(s.round_index)+1;let round;try{round=s.selected_pack_key==='personal'?await personalRound(s,nextIndex):chooseNightV2Round({packKey:s.selected_pack_key,roundIndex:nextIndex,level:nextIntensity,permissions:safeJson(s.permissions,[]),usedKeys:used});}catch(error){if(s.selected_pack_key==='personal')await db.query(`UPDATE night_v2_players SET round_reaction='',updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId)]);throw error;}if(!round)await completeSession(s.id,nextIntensity);else{await db.query(`UPDATE night_v2_sessions SET status='active',intensity=$2,round_index=$3,current_round=$4::jsonb,used_keys=$5::jsonb,updated_at=now() WHERE id=$1`,[s.id,nextIntensity,nextIndex,JSON.stringify(round),JSON.stringify([...used,round.key])]);await db.query(`UPDATE night_v2_players SET done_round=-1,round_reaction='',updated_at=now() WHERE session_id=$1`,[s.id]);}}if(!testMode){await learning.rebuild().catch(()=>{});await harmony.refreshHypotheses?.().catch(()=>{});}}return view(userId);}

  async function completeSession(sessionId,intensity=null){const s=await session(sessionId);if(!s)return null;await db.query(`UPDATE night_v2_sessions SET status='complete',intensity=COALESCE($2,intensity),completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1`,[s.id,intensity]);if(s.experience_id)await db.query(`UPDATE lovestory_experiences SET status='completed',completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1`,[s.experience_id]).catch(()=>{});return session(sessionId);}
  async function finish({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');await completeSession(m.session_id);return view(userId);}
  async function rateOverall({userId,reaction}){if(!REACTIONS.has(String(reaction)))throw new Error('NIGHT_V2_REACTION_INVALID');const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.status!=='complete')throw new Error('NIGHT_V2_NOT_COMPLETE');await db.query(`UPDATE night_v2_players SET overall_reaction=$3,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[s.id,String(userId),String(reaction)]);const testMode=await isTestSession(s.id);if(s.experience_id)await eventFeedback.submit(String(userId),s.experience_id,String(reaction),{learn:!testMode}).catch(()=>{});if(!testMode){const ps=await players(s.id),reactions=ps.map(p=>String(p.overall_reaction||'')).filter(x=>REACTIONS.has(x));if(reactions.length===2)await relationshipBridge.recordSessionOutcome({sessionId:s.id,reactions}).catch?.(()=>{});}return view(userId);}
  async function closePlayer(sessionId,userId){await db.query(`UPDATE night_v2_players SET active=false,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[sessionId,String(userId)]);const {rows}=await db.query(`SELECT count(*)::int AS active FROM night_v2_players WHERE session_id=$1 AND active=true AND telegram_user_id>0`,[sessionId]);if(Number(rows[0]?.active||0)===0)await db.query(`UPDATE night_v2_sessions SET status='ended',updated_at=now() WHERE id=$1`,[sessionId]);return {mode:'complete',version:2,session_id:sessionId};}
  async function saveDay({userId,visibility='private'}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(!s?.experience_id)throw new Error('NIGHT_V2_EXPERIENCE_REQUIRED');await eventFeedback.saveToDay(String(userId),s.experience_id,{visibility:visibility==='shared'?'shared':'private'});return closePlayer(s.id,userId);}
  async function dismissDay({userId}){const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');const s=await session(m.session_id);if(s?.experience_id)await eventFeedback.dismissDayShare(String(userId),s.experience_id).catch(()=>{});return closePlayer(s.id,userId);}
  async function leave({userId}){const m=await membership(userId);if(!m)return null;await db.query(`UPDATE night_v2_players SET active=false,updated_at=now() WHERE session_id=$1 AND telegram_user_id=$2`,[m.session_id,String(userId)]);await db.query(`UPDATE night_v2_sessions SET status='ended',updated_at=now() WHERE id=$1`,[m.session_id]);return true;}

  async function attachTestPartner({userId}){
    const m=await membership(userId);if(!m)throw new Error('NIGHT_V2_SESSION_REQUIRED');
    const s=await session(m.session_id);if(s.status!=='waiting'&&s.status!=='story')throw new Error('NIGHT_V2_ROOM_NOT_AVAILABLE');
    const synthetic=String(-(900000000000n+BigInt(String(s.id)))),existing=await players(s.id),me=existing.find(p=>String(p.telegram_user_id)===String(userId));
    if(!me||isSyntheticUser(me.telegram_user_id))throw new Error('NIGHT_V2_TEST_FORBIDDEN');
    const otherRole=me.role==='A'?'B':'A',partner=existing.find(p=>p.role===otherRole);
    if(partner&&!isSyntheticUser(partner.telegram_user_id)){
      if(partner.story_submitted||partner.selection_submitted)throw new Error('NIGHT_V2_TEST_PARTNER_ALREADY_RESPONDED');
      await db.query(`UPDATE night_v2_players SET telegram_user_id=$2,display_name='ИИ-партнёр · симуляция',selection='{}'::jsonb,selection_submitted=false,story_choice='',story_submitted=false,selector_choice='',done_round=-1,round_reaction='',overall_reaction='',connection_acknowledged=true,active=true,updated_at=now() WHERE session_id=$1 AND role=$3`,[s.id,synthetic,otherRole]);
    }else if(!partner){
      if(me.role!=='A')throw new Error('NIGHT_V2_TEST_PARTNER_MISSING');
      await db.query(`INSERT INTO night_v2_players(session_id,telegram_user_id,role,display_name,connection_acknowledged) VALUES($1,$2,'B','ИИ-партнёр · симуляция',true)`,[s.id,synthetic]);
    }
    await db.query(`UPDATE night_v2_sessions SET status='story',connection_verified_at=COALESCE(connection_verified_at,now()),updated_at=now() WHERE id=$1`,[s.id]);
    await db.query(`UPDATE night_v2_players SET connection_acknowledged=true,updated_at=now() WHERE session_id=$1`,[s.id]);
    const fresh=await session(s.id),flow=storyFlowOf(fresh);
    if(flow?.scene?.title)kickSyntheticStoryChoice(s.id);else kickPrepareStory(s.id);
    console.log('NIGHT_AI_TEST_PARTNER_READY',JSON.stringify({session_id:s.id,mode:'storybook'}));
    return view(userId);
  }

  async function view(userId){await init();const m=await membership(userId);if(!m)return {mode:'home',version:4,catalog:nightCatalog(),wish_match:(await mutualWishes()).length>0,my_wishes:await privateWishes(userId)};let s=await session(m.session_id);if(['matching','selector'].includes(s.status)){await reconcileSelections(s.id);s=await session(s.id);}const ps=await players(s.id),me=ps.find(p=>String(p.telegram_user_id)===String(userId));if(!me)throw new Error('NIGHT_V2_PLAYER_NOT_FOUND');const connection=ps.length===2&&s.connection_verified_at?connectionFingerprint({nonce:s.connection_nonce,roomCode:s.room_code,ownerId:ps.find(p=>p.role==='A')?.telegram_user_id||OWNER_ID,partnerId:ps.find(p=>p.role==='B')?.telegram_user_id||PARTNER_ID}):null,flow=storyFlowOf(s),scene=flow.scene||null;const base={version:4,session_id:s.id,room_code:s.room_code,role:me.role,partner_connected:ps.length===2,ui_theme:String(s.ui_theme||'domination'),evening_mode:String(s.evening_mode||'adaptive'),connection_verified:Boolean(s.connection_verified_at)&&ps.length===2,connection_fingerprint:connection,test_mode:ps.some(p=>isSyntheticUser(p.telegram_user_id)),wish_match:ps.some(p=>isSyntheticUser(p.telegram_user_id))?false:(await mutualWishes()).length>0,my_wishes:await privateWishes(userId),story_flow:flow,story_scene:scene,story_stage:Number(flow.stage)||0,story_arc:flow.arc||storyArcStage(Number(flow.stage)||0),story_reader_key:scene?.title?`stage:${Number(flow.stage)||0}:${String(scene.title||'')}`:'',story_reader_progress:(scene?.title&&String(me.reader_scene_key||'')===`stage:${Number(flow.stage)||0}:${String(scene.title||'')}`)?Math.max(0,Number(me.reader_page)||0):0};if(s.status==='waiting')return {...base,mode:'waiting_partner'};if(s.connection_verified_at&&!me.connection_acknowledged&&s.status!=='story')return {...base,mode:'connection_verified'};if(s.status==='story'){
      if(!scene?.title){kickPrepareStory(s.id);return {...base,mode:'story_loading'};}
      if(flow.generating)return {...base,mode:'story_loading'};
      if(scene.final)return me.story_submitted?{...base,mode:'story_waiting_final'}:{...base,mode:'story_final'};
      return me.story_submitted?{...base,mode:'story_waiting'}:{...base,mode:'story_scene'};
    }
    if(s.status==='matching'){const match=safeJson(s.match_payload,{}),kind=match?.kind||'';if(kind==='no_safe')return {...base,mode:'no_safe',match};if(kind==='version_mismatch')return {...base,mode:'version_mismatch',match};return me.selection_submitted?{...base,mode:'waiting_choice'}:{...base,mode:'private_choice',catalog:nightCatalog(),mode_categories:storyModeCategories(String(s.evening_mode||'adaptive')),mode_permissions:storyModePermissions(String(s.evening_mode||'adaptive'))};}
    if(s.status==='selector'){const options=safeJson(s.selector_options,[]).map(o=>({...displayForPack(o.key),hint:o.hint||''}));return me.selector_choice?{...base,mode:'waiting_selector',options}:{...base,mode:'selector',options};}
    if(s.status==='ready')return {...base,mode:'ready',pack:s.selected_pack_key?(s.selected_pack_key==='personal'?{key:'personal',title:'Ваша идея',description:'По вашим приватным ответам и истории пары.'}:displayForPack(s.selected_pack_key)):null,match:safeJson(s.match_payload,{})};
    if(s.status==='active'){const task=safeJson(s.current_round,{}),card=me.role==='A'?task.role_a:task.role_b;return {...base,mode:Number(me.done_round)===Number(s.round_index)?'waiting_done':'task',pack:s.selected_pack_key?(s.selected_pack_key==='personal'?{key:'personal',title:'Ваша идея'}:displayForPack(s.selected_pack_key)):null,round_index:s.round_index+1,max_rounds:MAX_ROUNDS,task:{key:task.key,title:card?.title||task.shared_task?.title||'',text:card?.text||task.shared_task?.text||'',cue:card?.cue||'',heat:task.heat||1,leader:task.leader===String(me.role||'').toLowerCase()}};}
    if(s.status==='feedback'){return REACTIONS.has(String(me.round_reaction))?{...base,mode:'waiting_feedback'}:{...base,mode:'round_feedback'};}
    if(s.status==='complete'){if(!REACTIONS.has(String(me.overall_reaction)))return {...base,mode:'overall_feedback'};const f=s.experience_id?await eventFeedback.get(String(userId),s.experience_id).catch(()=>null):null;if(f?.day_share_status==='offered'||f?.day_share_status==='not_offered')return {...base,mode:'day_share',overall_reaction:me.overall_reaction};return {...base,mode:'complete',overall_reaction:me.overall_reaction,day_share_status:f?.day_share_status||'dismissed'};}
    return {...base,mode:'home'};}

  async function close(){if(ownsPool)await db.end();}
  return {db,init,create,join,acknowledgeConnection,view,submitStoryChoice,saveReaderProgress,finishStory,prepareStoryScene,advanceStory,primeSyntheticStoryChoice,submitSelection,submitStoryAnswers,reconcileStory,retrySelection,selectCompromise,start,markDone,changeTask,rateRound,finish,rateOverall,saveDay,dismissDay,leave,attachTestPartner,saveWish,privateWishes,mutualWishes,membership,players,session,ensureStoryInterview,relationshipContext:()=>relationshipBridge.context(),close};
}
