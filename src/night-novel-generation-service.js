import {spawn} from 'node:child_process';

export function createNightNovelGenerationService({store}={}){
  if(!store)throw new Error('NIGHT_NOVEL_GENERATION_STORE_REQUIRED');
  let child=null,lastStart=0,lastExit=null,starting=false;

  async function status(){
    const db=await store.status();
    return {...db,runner:{running:Boolean(child),pid:child?.pid||null,last_start:lastStart||null,last_exit:lastExit}};
  }

  function spawnGenerator(current=null,{recovery=false}={}){
    const env={...process.env};
    const active=['generating','illustrating'].includes(String(current?.status||''));
    if(active&&current?.id)env.NIGHT_RESUME_NOVEL_ID=String(current.id);
    else delete env.NIGHT_RESUME_NOVEL_ID;

    child=spawn(process.execPath,['scripts/night-generate-linear-novel.mjs'],{
      cwd:process.cwd(),env,stdio:['ignore','inherit','inherit']
    });
    lastStart=Date.now();lastExit=null;
    console.log('NIGHT_NOVEL_RUNNER_STARTED',JSON.stringify({pid:child.pid||null,recovery:Boolean(recovery&&active),resume_novel_id:active?current.id:null,status:active?current.status:'new'}));
    child.once('exit',(code,signal)=>{
      lastExit={code,signal,at:Date.now()};
      console.log('NIGHT_NOVEL_RUNNER_EXIT',JSON.stringify(lastExit));
      child=null;
    });
    child.once('error',(error)=>{
      lastExit={error:String(error?.message||error),at:Date.now()};
      console.error('NIGHT_NOVEL_RUNNER_ERROR',JSON.stringify(lastExit));
      child=null;
    });
    return {started:true,recovery:Boolean(recovery&&active),pid:child.pid,resume_novel_id:active?current.id:null};
  }

  async function start(){
    if(child)return {started:false,reason:'already_running',status:await status()};
    if(starting)return {started:false,reason:'start_in_progress',status:await status()};
    starting=true;
    try{
      const current=await store.status();
      const active=['generating','illustrating'].includes(String(current.status));
      const launched=spawnGenerator(active?current:null,{recovery:active});
      return {...launched,status:await status()};
    }finally{starting=false;}
  }

  async function recover(){
    if(child)return {started:false,reason:'already_running',status:await status()};
    if(starting)return {started:false,reason:'start_in_progress',status:await status()};
    starting=true;
    try{
      const current=await store.status();
      if(!['generating','illustrating'].includes(String(current.status)))return {started:false,reason:'nothing_to_recover',status:await status()};
      const launched=spawnGenerator(current,{recovery:true});
      console.log('NIGHT_NOVEL_RECOVERY_STARTED',JSON.stringify({novel_id:current.id,status:current.status,pid:launched.pid||null}));
      return {...launched,status:await status()};
    }finally{starting=false;}
  }

  async function stop(){
    if(!child)return {stopped:false,reason:'not_running'};
    child.kill('SIGTERM');
    return {stopped:true};
  }

  return {start,recover,status,stop};
}
