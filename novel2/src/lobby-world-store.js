/* Persistent Secret Host visual scene state, scoped by pair and player role. */
import crypto from 'node:crypto';
import {db,pairKey} from './db.js';
import {normalizeGuestPlace,buildLobbyWorldPrompt} from './lobby-world.js';
const ROLES=new Set(['A','B']);
export async function initLobbyWorldStore(){
 await db.query("CREATE TABLE IF NOT EXISTS novel2_lobby_world(pair_key text NOT NULL, role text NOT NULL CHECK(role IN ('A','B')),job_id text NOT NULL,place text NOT NULL,mood text NOT NULL DEFAULT 'тайна',prompt text NOT NULL,status text NOT NULL DEFAULT 'working',image_base64 text NOT NULL DEFAULT '',model text NOT NULL DEFAULT '',error_code text NOT NULL DEFAULT '',started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(pair_key,role))");
}
export async function getLobbyWorld(role){
 if(!ROLES.has(role))throw new Error('NOVEL2_LOBBY_ROLE_INVALID');
 const {rows}=await db.query('SELECT * FROM novel2_lobby_world WHERE pair_key=$1 AND role=$2',[pairKey(),role]);
 return rows[0]||null;
}
export function lobbyWorldStatus(row,{includeImage=false}={}){
 if(!row)return{status:'idle'};
 const view={status:row.status,place:row.place,mood:row.mood,
   started_at:row.started_at,updated_at:row.updated_at,error_code:row.error_code||null};
 if(includeImage&&row.status==='ready'&&row.image_base64)
   view.image='data:image/jpeg;base64,'+row.image_base64;
 return view;
}
export async function prepareLobbyWorld({role,place,mood='тайна'}){
 if(!ROLES.has(role))throw new Error('NOVEL2_LOBBY_ROLE_INVALID');
 const safePlace=normalizeGuestPlace(place);
 const safeMood=['тайна','притяжение','приключение'].includes(mood)?mood:'тайна';
 const prior=await getLobbyWorld(role);
 if(prior?.status==='working'){
   if(prior.place===safePlace&&prior.mood===safeMood)return{work:null,state:prior};
   throw new Error('NOVEL2_LOBBY_WORLD_ALREADY_RUNNING');
 }
 if(prior?.status==='ready'&&prior.place===safePlace&&prior.mood===safeMood&&prior.image_base64)
   return{work:null,state:prior};
 const jobId=crypto.randomUUID(),prompt=buildLobbyWorldPrompt({place:safePlace,mood:safeMood});
 const {rows}=await db.query(
   "INSERT INTO novel2_lobby_world(pair_key,role,job_id,place,mood,prompt,status,image_base64,model,error_code,started_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'working','','','',now(),now()) ON CONFLICT(pair_key,role) DO UPDATE SET job_id=EXCLUDED.job_id,place=EXCLUDED.place,mood=EXCLUDED.mood,prompt=EXCLUDED.prompt,status='working',image_base64='',model='',error_code='',started_at=now(),updated_at=now() RETURNING *",
   [pairKey(),role,jobId,safePlace,safeMood,prompt]
 );
 return{work:{role,job_id:jobId},state:rows[0]};
}
export async function completeLobbyWorld({role,jobId,imageBase64='',model='',errorCode=''}){
 if(!ROLES.has(role))throw new Error('NOVEL2_LOBBY_ROLE_INVALID');
 const valid=Boolean(imageBase64&&imageBase64.length>1000);
 const {rows}=await db.query(
   "UPDATE novel2_lobby_world SET status=$4,image_base64=$5,model=$6,error_code=$7,updated_at=now() WHERE pair_key=$1 AND role=$2 AND job_id=$3 AND status='working' RETURNING *",
   [pairKey(),role,jobId,valid?'ready':'failed',valid?imageBase64:'',String(model||'').slice(0,200),
    valid?'':String(errorCode||'GENERATION_FAILED').replace(/[^A-Z0-9_]/g,'').slice(0,60)]
 );
 if(!rows.length)throw new Error('NOVEL2_LOBBY_JOB_STALE');
 return rows[0];
}
