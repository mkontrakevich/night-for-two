import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

// Browser-only fixture: two authenticated roles, no real people, model calls,
// payments, or changes to the actual Novel2 database.
let advanced=false,answers=0,visualCalls=0;
const common=(role)=>({role,mode:'reader',identity:{[role]:true},
 characters:{[role]:{ready:true}},cast:[],active_control_mode:'human',
 book:{id:'42',title:'Pair fixture',chapter_no:1,turn_no:advanced?2:1}});
function stateFor(role){
 const scene=advanced
  ?{chapter_no:1,prose:'The fictional conversation continued after B answered.',primary_interaction:{prompt:role==='A'?'What will A do next?':''},optional_actions:[],noir_progress:{finale:false}}
  :{chapter_no:1,prose:'A waits for the other player at the old fictional hotel.',primary_interaction:{prompt:role==='B'?'What will B decide?':''},optional_actions:[],noir_progress:{finale:false}};
 return {...common(role),scene,active_role:advanced?'A':'B',
  can_reply:advanced?role==='A':role==='B',
  async_pair:{enabled:true,decision_owner:advanced?'A':'B',waiting_for:advanced?(role==='A'?null:'partner'):(role==='A'?'partner':null),awaiting_both:false,answered_by_me:false},
  pending_reply:null};
}
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname,role=req.headers['x-novel2-local-user']==='local_b'?'B':'A';
 if(path.startsWith('/novel2/api/')){
  let raw='';for await(const chunk of req)raw+=chunk.toString();
  const data={ok:true};
  if(path.endsWith('/api/state'))data.state=stateFor(role);
  else if(path.endsWith('/api/books'))Object.assign(data,{books:[],drafts:[]});
  else if(path.endsWith('/story/drafts'))data.drafts=[];
  else if(path.endsWith('/story/draft/launch/status'))Object.assign(data,{job:null,state:null});
  else if(path.endsWith('/looks'))data.looks=[];
  else if(path.endsWith('/api/reply')){
   assert.equal(role,'B');
   assert.equal(advanced,false);
   const input=JSON.parse(raw);assert.equal(input.book_id,'42');
   assert.equal(input.turn_no,1);
   assert.match(input.reply,/key|двер|door/i);
   answers++;advanced=true;data.state=stateFor('B');
  }else if(path.endsWith('/api/visual')){visualCalls++;data.image='';}
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(data));return;
 }
 const file=path==='/novel2/'?'index.html':path.replace('/novel2/','');
 if(!/^[a-zA-Z0-9.-]+$/.test(file)){res.writeHead(404);res.end();return;}
 try{const content=await fs.readFile(new URL('../public/'+file,import.meta.url));
  res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
  res.end(content);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let channel;try{execFileSync('which',['google-chrome'],{stdio:'ignore'});channel='chrome'}catch{}
const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
const url='http://127.0.0.1:'+server.address().port+'/novel2/';
try{
 for(const viewport of [{width:393,height:852},{width:1280,height:900}]){
  advanced=false;answers=0;visualCalls=0;
  const open=async(role)=>{
   const ctx=await browser.newContext({viewport});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',route=>route.fulfill({contentType:'text/javascript',body:''}));
   // Local browser fixture runs on 127.0.0.1. Production authenticates
   // signed Telegram initData; only this fixture supplies synthetic role headers.
   await page.route('**/novel2/api/**',route=>route.continue({headers:{...route.request().headers(),'x-novel2-local-user':role==='B'?'local_b':'local_a'}}));
   await page.addInitScript((player)=>{
     localStorage.setItem('novel2_host_introduced','1');
     localStorage.setItem('novel2_local_user',player==='B'?'local_b':'local_a');
   },role);
   await page.goto(url);
   await page.waitForFunction(expected=>state?.mode==='reader'&&state?.role===expected,role);
   return {page,ctx,errors};
  };
  const A=await open('A');
  assert.equal(await A.page.locator('#reply').isDisabled(),true);
  assert.match(await A.page.locator('body').innerText(),/история продолжится|История сохранена/i);
  const debug=await A.page.evaluate(()=>({pair:state?.async_pair,canReply:state?.can_reply,html:document.querySelector('.status')?.innerHTML,button:document.getElementById('checkPartnerReply')?.outerHTML,display:document.getElementById('checkPartnerReply')?getComputedStyle(document.getElementById('checkPartnerReply')).display:null}));
  console.log('N4T_PAIR_WAIT_DIAG',JSON.stringify(debug).slice(0,1800));
  assert.equal(await A.page.locator('#checkPartnerReply').isVisible(),true);
  const B=await open('B');
  assert.equal(await B.page.locator('#reply').isEnabled(),true);
  await B.page.locator('#reply').fill('I open the door with the old key.');
  await B.page.locator('#send').click();
  await B.page.waitForFunction(()=>state?.book?.turn_no===2);
  assert.equal(answers,1);
  await A.page.locator('#checkPartnerReply').click();
  await A.page.waitForFunction(()=>state?.book?.turn_no===2&&state?.can_reply===true);
  assert.equal(await A.page.locator('#reply').isEnabled(),true);
  assert.match(await A.page.locator('body').innerText(),/What will A do next/);
  assert.equal(visualCalls,0,'No hidden paid image generation');
  assert.equal(await A.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(A.errors,[]);assert.deepEqual(B.errors,[]);
  await A.ctx.close();await B.ctx.close();
 }
 console.log('NIGHT4TWO_PAIR_BROWSER_OK mobile_desktop=true B_offline_wait=true B_resume=true A_continues=true no_paid_visual=true');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
