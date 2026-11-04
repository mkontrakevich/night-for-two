// Pure transition rules shared by the cloud job coordinator and tests.
// Persist every returned state before making the corresponding external call.
export function beginModel(job){
  if(job.state!=='queued')throw Error('JOB_NOT_QUEUED');
  const index=job.results.length;
  if(index>=job.models.length)throw Error('ALL_MODELS_DONE');
  return {...job,state:'running',attempt:crypto.randomUUID(),results:[...job.results,{model:job.models[index],status:'running'}]};
}
export function finishModel(job,attempt,result){
  if(job.state!=='running'||job.attempt!==attempt)throw Error('STALE_ATTEMPT');
  const results=job.results.map(x=>({...x})),last=results.at(-1);
  if(!last||last.status!=='running')throw Error('INVALID_JOB');
  if(result?.refused===true)last.status='refused';
  else if(result?.uncertain===true){last.status='uncertain';last.error='PROVIDER_RESPONSE_UNCERTAIN'}
  else if(typeof result?.content==='string'&&result.content.trim()){last.status='complete';last.content=result.content;last.usage=result.usage||null}
  else{last.status='failed';last.error='EMPTY_RESPONSE'}
  return {...job,attempt:null,results,state:last.status==='uncertain'?'uncertain':results.length<job.models.length?'queued':'ready_to_export'};
}
export function interrupted(job){
  if(job.state==='running'){
    const results=job.results.map(x=>({...x}));
    if(results.at(-1)?.status==='running')Object.assign(results.at(-1),{status:'uncertain',error:'INTERRUPTED'});
    return {...job,state:'uncertain',attempt:null,results};
  }
  if(job.state==='uploading_source')return {...job,state:'source_uncertain'};
  if(job.state==='exporting')return {...job,state:'export_uncertain'};
  return job;
}
