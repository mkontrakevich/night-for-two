import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,assertProductionConfig} from './config.js';
import {authenticate} from './auth.js';
import {initDb,latestBook,createBook,appendTurn,recentTurns,advanceBook,identities,saveIdentity,approveIdentity,db} from './db.js';
import {createStoryBible,continueStory} from './prose-engine.js';
import {analyzeIdentity,buildLock} from './identity-engine.js';
import {generateVisual,generateCalibration} from './visual-engine.js';

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
function publicState(book,auth,ids={}){
  if(!book)return{mode:'home',role:auth.role,identity:{A:Boolean(ids.A?.approved),B:Boolean(ids.B?.approved)}};
  const scene=book.current_scene||{};
  return{
    mode:'reader',
    role:auth.role,
    book:{id:book.id,title:book.title,chapter_no:book.chapter_no,turn_no:book.turn_no},
    scene,
    active_role:book.active_role,
    can_reply:String(book.active_role)===String(auth.role),
    identity:{A:Boolean(ids.A?.approved),B:Boolean(ids.B?.approved)}
  };
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

      if(url.pathname==='/novel2/api/state'){
        return send(res,200,{ok:true,state:publicState(book,auth,ids)});
      }

      if(url.pathname==='/novel2/api/start'){
        if(!book){
          const bible=await createStoryBible();
          book=await createBook({title:bible.title,storyBible:bible,scene:bible.first_scene,activeRole:bible.first_scene.target_role});
        }
        ids=await identities();
        return send(res,200,{ok:true,state:publicState(book,auth,ids)});
      }

      if(url.pathname==='/novel2/api/reply'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        if(String(book.active_role)!==auth.role)return send(res,409,{ok:false,error:'NOVEL2_NOT_YOUR_TURN'});
        const reply=String(input.reply||'').trim();
        if(reply.length<1||reply.length>3000)return send(res,400,{ok:false,error:'NOVEL2_REPLY_INVALID'});

        const replyTurn=Number(book.turn_no||0)+1;
        await appendTurn(book.id,replyTurn,auth.role,'reply',reply,{action_key:String(input.action_key||'')});
        const history=await recentTurns(book.id,18);
        const next=await continueStory({book,recentTurns:history,playerRole:auth.role,playerReply:reply,actionKey:String(input.action_key||'')});
        book=await advanceBook(book,{scene:next.scene,canon:next.canon,activeRole:next.scene.target_role});
        ids=await identities();
        return send(res,200,{ok:true,state:publicState(book,auth,ids)});
      }

      if(url.pathname==='/novel2/api/identity/analyze'){
        const role=auth.role;
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
        if(refs.length<2)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_REFERENCES_REQUIRED'});
        const analyzed=await analyzeIdentity({role,referenceImages:refs,userFacts:input.user_facts||{}});
        const saved=await saveIdentity(role,{profile:analyzed.profile,identityLock:analyzed.identityLock,referenceImages:refs,approved:false});
        const calibration=await generateCalibration({identity:saved,role});
        return send(res,200,{ok:true,identity:{role,approved:false,version:saved.version,profile:saved.profile},calibration:'data:image/jpeg;base64,'+calibration.base64});
      }

      if(url.pathname==='/novel2/api/identity/register'){
        const role=auth.role;
        const profile=input.profile&&typeof input.profile==='object'?input.profile:{};
        const refs=Array.isArray(input.reference_images)?input.reference_images.slice(0,6):[];
        if(!Object.keys(profile).length)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_PROFILE_REQUIRED'});
        const identityLock=buildLock(role,profile);
        await saveIdentity(role,{profile,identityLock,referenceImages:refs,approved:Boolean(input.approved)});
        ids=await identities();
        return send(res,200,{ok:true,identity:{role,approved:Boolean(ids[role]?.approved),version:ids[role]?.version||1}});
      }

      if(url.pathname==='/novel2/api/identity/approve'){
        const saved=await approveIdentity(auth.role);
        return send(res,200,{ok:true,identity:{role:auth.role,approved:true,version:saved.version}});
      }

      if(url.pathname==='/novel2/api/identity/calibrate'){
        ids=await identities();
        const identity=ids[auth.role];
        if(!identity)return send(res,400,{ok:false,error:'NOVEL2_IDENTITY_NOT_FOUND'});
        const calibration=await generateCalibration({identity,role:auth.role});
        return send(res,200,{ok:true,calibration:'data:image/jpeg;base64,'+calibration.base64});
      }

      if(url.pathname==='/novel2/api/visual'){
        if(!book)return send(res,400,{ok:false,error:'NOVEL2_BOOK_REQUIRED'});
        ids=await identities();
        const generated=await generateVisual({scene:book.current_scene||{},identities:ids});
        return send(res,200,{ok:true,image:'data:image/jpeg;base64,'+generated.base64,model:generated.model,prompt:generated.prompt});
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
