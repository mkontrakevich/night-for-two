import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

let job=null,offline=false,ready=false,starts=0;
const home={role:'A',mode:'home',characters:{A:{ready:true}},identity:{A:true}};
const chapter={...home,mode:'reader',book:{id:'8',title:'Fixture book',chapter_no:1},scene:{prose:'Launch fixture chapter',chapter_no:1},can_reply:true,active_role:'A',active_control_mode:'human',cast:[]};
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/novel2/api/')){
    for await(const _chunk of req){};
    if(path.endsWith('/launch/status')&&offline){res.destroy();return;}
    let data={ok:true};
    if(path.endsWith('/api/state'))data.state=home;
    if(path.endsWith('/api/books'))Object.assign(data,{books:[],drafts:[]});
    if(path.endsWith('/story/drafts'))data.drafts=[];
    if(path.endsWith('/launch')){starts++;job={draft_id:'7',status:'working',stage:'first_chapter'};data.job=job;}
    if(path.endsWith('/launch/status'))Object.assign(data,{job:ready?{...job,status:'ready',book_id:'8'}:job,state:ready?chapter:null});
    if(path.endsWith('/looks'))data.looks=[];
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
  }
  const file=path==='/novel2/'?'index.html':path.replace('/novel2/','');
  if(!/^[a-zA-Z0-9.-]+$/.test(file)){res.writeHead(404);res.end();return;}
  try{const content=await fs.readFile(new URL('../public/'+file,import.meta.url));res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(content);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let channel;try{execFileSync('which',['google-chrome'],{stdio:'ignore'});channel='chrome';}catch{}
const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
try{
  for(const viewport of [{width:393,height:852},{width:1280,height:900}]){
    job=null;offline=false;ready=false;starts=0;
    const context=await browser.newContext({viewport});const page=await context.newPage();
    const errors=[],dialogs=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
    await page.route('https://**/*',route=>route.fulfill({contentType:'text/javascript',body:''}));
    await page.addInitScript(()=>localStorage.setItem('novel2_host_introduced','1'));
    await page.goto('http://127.0.0.1:'+server.address().port+'/novel2/');
    await page.waitForFunction(()=>state?.role==='A');
    await page.evaluate(()=>{storyDraft={id:'7',title:'Fixture',blueprint:{title:'Fixture'}};void launchStoryDraft();});
    await page.getByRole('heading',{name:'Создаём первую главу'}).waitFor();
    assert.equal(starts,1);
    await page.reload();await page.getByRole('heading',{name:'Создаём первую главу'}).waitFor();assert.equal(starts,1,'Reload must not resubmit generation');
    offline=true;await page.getByRole('button',{name:'Проверить статус',exact:true}).click();
    await page.getByText('Генерация не запущена повторно.',{exact:false}).waitFor();
    assert.equal(starts,1);assert.equal(dialogs.length,0,'Transport failures must not leave a blocking native alert');
    await fs.mkdir('/tmp/novel2-launch-qa',{recursive:true});
    await page.screenshot({path:'/tmp/novel2-launch-qa/recovery-'+viewport.width+'.png',fullPage:true});
    offline=false;ready=true;
    await page.getByText('Launch fixture chapter',{exact:true}).waitFor().catch(async error=>{console.log('RECOVERY_FIXTURE',await page.evaluate(()=>({failures:storyLaunch.readFailures,reading:storyLaunch.reading,job:storyLaunch.job,remembered:storyLaunch.remembered(),screen:document.body.innerText.slice(-1500)})),errors);throw error;});
    // The next read-only retry must recover without a manual click or a new launch.
    assert.equal(starts,1);assert.equal(errors.length,0,errors.join('\n'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
    await page.evaluate(()=>showLaunchJob({draft_id:'7',status:'failed',stage:'first_chapter',error_code:'NOVEL2_BIBLE_SCENE_MISSING'}));
    await page.getByRole('heading',{name:'Создание истории остановлено',exact:true}).waitFor();
    await page.getByText('AI не вернул полноценную первую главу.',{exact:false}).waitFor();
    assert.equal(starts,1,'Failure display must not start generation');
    await page.evaluate(()=>showLaunchJob({draft_id:'7',status:'failed',stage:'first_chapter',error_code:'NOVEL2_BIBLE_TOO_SHORT',candidate_prose_chars:2800}));
    await page.getByText('Текст первой главы получен (2800 символов)',{exact:false}).waitFor();
    await page.getByText('Черновик сохранён:',{exact:false}).waitFor();
    assert.equal(starts,1);
    await page.evaluate(()=>{state.pending_reply={reply:'Fixture saved answer',action_key:''};menuMode=false;render();});
    assert.equal(await page.locator('#reply').inputValue(),'Fixture saved answer');
    assert.equal(await page.locator('#reply').evaluate(el=>el.readOnly),true);
    await page.getByRole('button',{name:'Продолжить обработку ответа',exact:true}).waitFor();
    await context.close();
  }
  console.log('NOVEL2_LAUNCH_BROWSER_OK mobile desktop reload disconnect recovery no_dialog no_resubmit');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}


