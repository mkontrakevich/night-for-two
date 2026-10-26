// Only status reads are retried. Starting/resuming generation always requires
// an explicit action; a lost start response is reconciled with persisted state.
globalThis.Novel2StoryLaunchClient=class {
  constructor({api,role,storage,onJob,onReady,onError,interval=3000,schedule=setTimeout,cancel=clearTimeout}){
    Object.assign(this,{api,role,storage,onJob,onReady,onError,interval,schedule,cancel});
    this.timer=null;this.reading=false;this.job=null;
  }
  key(){return 'novel2_story_launch:'+this.role();}
  remembered(){try{return this.storage.getItem(this.key())||'';}catch{return '';}}
  remember(id){try{this.storage.setItem(this.key(),String(id));}catch{}}
  forget(){try{this.storage.removeItem(this.key());}catch{}}
  stop(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;}
  async start(id,{resume=false}={}){
    this.stop();this.remember(id);this.job=null;
    try{
      // Capability check also prevents new UI from calling the old synchronous
      // launch handler while the origin deployment is still rolling out.
      const status=await this.api('story/draft/launch/status',{draft_id:id},15000);
      if(status.job&&(!resume||status.job.status==='ready')){this.accept(status);return status;}
      const result=await this.api('story/draft/launch',{draft_id:id,background:true,resume},15000);
      this.accept(result);return result;
    }catch(error){
      // A 202 may have been lost. Never submit another paid operation here.
      return this.check(id,{requireJob:true});
    }
  }
  accept(result){
    this.stop();this.job=result.job||null;
    if(!this.job)return;
    this.remember(this.job.draft_id);
    if(this.job.status==='ready'&&result.state){
      this.forget();this.onReady(result);return;
    }
    this.onJob(this.job);
    if(this.job.status==='working'&&!this.job.stalled)
      this.timer=this.schedule(()=>{void this.check(this.job.draft_id);},this.interval);
  }
  async check(id=this.remembered(),{requireJob=false}={}){
    if(this.reading)return;
    this.reading=true;
    try{
      const result=await this.api('story/draft/launch/status',id?{draft_id:id}:{},15000);
      if(!result.job){
        if(requireJob)throw new Error('Запуск пока не подтверждён сервером. Проверьте статус ещё раз; автоматического повтора генерации не было.');
        return result;
      }
      if(!id&&result.job.status!=='working')return result;
      this.accept(result);return result;
    }catch(error){
      this.stop();
      this.onError(error);return null;
    }finally{this.reading=false;}
  }
};
