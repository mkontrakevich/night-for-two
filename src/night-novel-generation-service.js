import {spawn} from 'node:child_process';

export function createNightNovelGenerationService({store}={}){
  if(!store)throw new Error('NIGHT_NOVEL_GENERATION_STORE_REQUIRED');
  let child=null,lastStart=0,lastExit=null;

  async function status(){
    const db=await store.status();
    return {...db,runner:{running:Boolean(child),pid:child?.pid||null,last_start:lastStart||null,last_exit:lastExit}};
  }

  async function start(){
    const current=await store.status();
    if(child)return {started:false,reason:'already_running',status:await status()};
    if(['generating','illustrating'].includes(String(current.status)))return {started:false,reason:'generation_in_progress',status:await status()};
    const env={...process.env};
    child=spawn(process.execPath,['scripts/night-generate-linear-novel.mjs'],{
      cwd:process.cwd(),env,stdio:['ignore','inherit','inherit']
    });
    lastStart=Date.now();lastExit=null;
    child.once('exit',(code,signal)=>{lastExit={code,signal,at:Date.now()};child=null;});
    child.once('error',(error)=>{lastExit={error:String(error?.message||error),at:Date.now()};child=null;});
    return {started:true,pid:child.pid,status:await status()};
  }

  async function stop(){
    if(!child)return {stopped:false,reason:'not_running'};
    child.kill('SIGTERM');
    return {stopped:true};
  }

  return {start,status,stop};
}
