import http from 'node:http';
import {installNightForTwoMiniApp} from './night-for-two-miniapp-v3.js';
import {validateTelegramInitData} from './night-for-two-miniapp.js';
import {createNightLinearNovelStore} from './night-linear-novel-store.js';
import {createNightNovelGenerationService} from './night-novel-generation-service.js';

const FLAG=Symbol.for('night.for.two.backend.generator');
const PREFIX='/night/api/';
const LOCAL=/^(1|true|yes)$/i.test(String(process.env.NIGHT_LOCAL_TEST_MODE||''));
const OWNER=String(process.env.PRIMARY_OWNER_ID||(LOCAL?'local_owner':''));
const PARTNER=String(process.env.PARTNER_TELEGRAM_ID||(LOCAL?'local_partner':''));

function header(req,name){return String(req.headers?.[name]||req.headers?.[name.toLowerCase()]||'');}
function send(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body)});res.end(body);}
function allowed(req){
  if(LOCAL&&header(req,'x-night-local-test')==='1')return true;
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'');
  const auth=validateTelegramInitData(header(req,'x-telegram-init-data'),token);
  return [OWNER,PARTNER].includes(String(auth?.user?.id||''));
}

export function installNightBackendGenerator({port=5681}={}){
  if(globalThis[FLAG])return globalThis[FLAG];
  const app=installNightForTwoMiniApp({port});
  const store=createNightLinearNovelStore({pool:app.engine.db});
  const generator=createNightNovelGenerationService({store});
  const previousEmit=http.Server.prototype.emit;

  http.Server.prototype.emit=function(event,req,res,...args){
    const pathname=String(req?.url||'').split('?')[0];
    const isGenerator=event==='request'&&this.address?.()?.port===port&&
      (pathname===PREFIX+'novel-generate'||pathname===PREFIX+'novel-status');
    if(!isGenerator)return previousEmit.call(this,event,req,res,...args);

    Promise.resolve().then(async()=>{
      if(!allowed(req))return send(res,403,{ok:false,error:'NIGHT_ACCESS_DENIED'});
      if(req.method!=='POST')return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
      if(pathname===PREFIX+'novel-status')return send(res,200,{ok:true,state:await generator.status()});
      return send(res,202,{ok:true,state:await generator.start()});
    }).catch(error=>send(res,500,{ok:false,error:String(error?.message||'NIGHT_GENERATOR_ERROR')}));
    return true;
  };

  const installed={...app,version:4,novelGenerator:generator};
  Object.defineProperty(globalThis,FLAG,{value:installed,configurable:false});
  return installed;
}
