import {spawn} from 'node:child_process';

const ACTIVE=new Set(['generating','illustrating']);
const RETRYABLE_PLAN_ERROR=/NIGHT_NOVEL_(?:STRUCTURE_TOO_THIN|PROTAGONISTS_INVALID|ROLE_PAIR_INVALID|PLAN_FAILED)/;
const RETRYABLE_GENERATION_ERROR=/NIGHT_LINEAR_(?:CHAPTER_INVALID|PAGE_INVALID|ANONYMOUS_DIALOGUE|MEDIA_PROMPT_INVALID|ILLUSTRATION_DENSITY_INVALID|PAGE_COUNT_MISMATCH|PAGE_MISSING|IMAGE_FAILED|IMAGE_COUNT_MISMATCH|VISUAL_QA_REJECTED)/;

function canResume(current={}){
  const status=String(current?.status||'');
  if(ACTIVE.has(status))return true;
  if(status!=='failed')return false;
  const error=String(current?.error||'');
  const generated=Math.max(0,Number(current?.generated_pages)||0);
  const total=Math.max(1,Number(current?.total_pages)||100);
  if(generated===0&&RETRYABLE_PLAN_ERROR.test(error))return true;
  return generated<=total&&RETRYABLE_GENERATION_ERROR.test(error);
}

export function createNightNovelGenerationService({store}={}){
  if(!store)throw new Error('NIGHT_NOVEL_GENERATION_STORE_REQUIRED');
  let child=null,lastStart=0,lastExit=null,starting=false;

  async function status(){
    const db=await store.status();
    return {...db,runner:{running:Boolean(child),pid:child?.pid||null,last_start:lastStart||null,last_exit:lastExit}};
  }

  function spawnGenerator(current=null,{recovery=false}={}){
    const env={...process.env};
    const resumable=canResume(current)&&current?.id;
    if(resumable)env.NIGHT_RESUME_NOVEL_ID=String(current.id);
    else delete env.NIGHT_RESUME_NOVEL_ID;

    child=spawn(process.execPath,['scripts/night-generate-linear-novel.mjs'],{
      cwd:process.cwd(),env,stdio:['ignore','inherit','inherit']
    });
    lastStart=Date.now();lastExit=null;
    console.log('NIGHT_NOVEL_RUNNER_STARTED',JSON.stringify({pid:child.pid||null,recovery:Boolean(recovery&&resumable),resume_novel_id:resumable?current.id:null,status:resumable?current.status:'new'}));
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
    return {started:true,recovery:Boolean(recovery&&resumable),pid:child.pid,resume_novel_id:resumable?current.id:null};
  }

  async function start(){
    if(child)return {started:false,reason:'already_running',status:await status()};
    if(starting)return {started:false,reason:'start_in_progress',status:await status()};
    starting=true;
    try{
      const current=await store.status();
      const resume=canResume(current);
      const launched=spawnGenerator(resume?current:null,{recovery:resume});
      return {...launched,status:await status()};
    }finally{starting=false;}
  }

  async function recover(){
    if(child)return {started:false,reason:'already_running',status:await status()};
    if(starting)return {started:false,reason:'start_in_progress',status:await status()};
    starting=true;
    try{
      const current=await store.status();
      if(!canResume(current))return {started:false,reason:'nothing_to_recover',status:await status()};
      const launched=spawnGenerator(current,{recovery:true});
      console.log('NIGHT_NOVEL_RECOVERY_STARTED',JSON.stringify({novel_id:current.id,status:current.status,pid:launched.pid||null,retry_failed:current.status==='failed'}));
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
