import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {normalizeIllustrationPrepare} from '../cloudflare/novel2-preview/src/illustration-intake.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.env.PYTHON||'python3',['illustration_pipeline/workbench_browser_fixture.py'],{cwd:root,env:{...process.env,ILLUSTRATION_BROWSER_QA:'1'}});
child.stderr.on('data',value=>process.stderr.write(value));
const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('FIXTURE_START_TIMEOUT')),15000);readline.createInterface({input:child.stdout}).on('line',line=>{try{const d=JSON.parse(line);if(d.port){clearTimeout(timeout);resolve(d.port)}}catch{}});child.on('exit',code=>reject(Error('FIXTURE_EXIT_'+code)));});
let channel;try{execFileSync('which',['google-chrome'],{stdio:'ignore'});channel='chrome'}catch{}
const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
const installRoutes=async page=>{
 await page.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
 // Exercise the actual production edge normalizer before sending to the
 // private legacy-origin mock; the front end never provides instructions.
 await page.route('**/novel2/api/illustrations/prepare',async route=>{
  let payload;
  try{payload=normalizeIllustrationPrepare(route.request().postDataJSON())}
  catch(error){return route.fulfill({status:Number(error?.status)||422,contentType:'application/json',body:JSON.stringify({ok:false,error:String(error?.message||'SCENE_PAYLOAD_INVALID')})})}
  const headers={...route.request().headers(),'content-type':'application/json'};
  delete headers['content-length'];delete headers['transfer-encoding'];
  return route.continue({postData:JSON.stringify(payload),headers});
 });
};
try{
 for(const viewport of [{width:393,height:852},{width:1280,height:900}]){
  const context=await browser.newContext({viewport,acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await installRoutes(page);
  await page.goto('http://127.0.0.1:'+port+'/novel2/illustrations.html');
  assert.equal(await page.locator('#instructions').count(),0);
  assert.equal(await page.locator('#sampleRules').count(),0);
  assert.equal(await page.locator('#uploadStep').isVisible(),true);
  assert.equal(await page.locator('#generationStep').isVisible(),false);
  await page.locator('#source').setInputFiles({name:'scene.txt',mimeType:'text/plain',buffer:Buffer.from('Взрослая архивистка в тёмном пальто стоит у окна старого отеля. На подоконнике лежит латунный ключ; за окном море и туман.')});
  await page.locator('#prepare').click();
  await page.locator('#generationStep').waitFor({state:'visible'});
  assert.equal(await page.locator('#reviewStep').isVisible(),false);
  assert.equal(await page.locator('#exportStep').isVisible(),false);
  const direct=await page.evaluate(()=>fetch('/novel2/api/illustrations/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:'scene.txt',data:'YWFhYWFhYWFhYWFhYWFhYWFh',instructions:{}})}).then(r=>r.json()));
  assert.equal(direct.error,'SYSTEM_INSTRUCTIONS_SERVER_ONLY');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#generate').click();
  await page.locator('#reviewStep').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Утвердить кадр'}).first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.frame img')].length===1&&[...document.querySelectorAll('.frame img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.getByRole('button',{name:'Утвердить кадр'}).click();
  await page.locator('#exportStep').waitFor({state:'visible'});
  const file=page.waitForEvent('download');
  await page.locator('#export').click();
  assert.equal((await file).suggestedFilename(),'night4two_scene_illustrated.docx');
  await page.reload();
  await page.locator('#exportStep').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  await context.close();
 }
 const blocked=await browser.newContext({viewport:{width:393,height:852}});
 const page=await blocked.newPage();
 await installRoutes(page);
 await page.route('**/novel2/api/illustrations/configuration',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,configured:true,authenticated:false,status:403})}));
 await page.goto('http://127.0.0.1:'+port+'/novel2/illustrations.html');
 await page.locator('#source').setInputFiles({name:'blocked.txt',mimeType:'text/plain',buffer:Buffer.from('The adult archivist enters a quiet library with a dark window and antique lantern.')});
 await page.locator('#prepare').click();
 await page.locator('#generationStep').waitFor({state:'visible'});
 assert(await page.locator('#generate').isDisabled());
 assert((await page.locator('#providerStatus').innerText()).includes('недоступна'));
 await blocked.close();
 console.log('NIGHT4TWO_V3_BROWSER_OK mobile_desktop=true scene_only=true injected_instructions_rejected=true approval_export_restore=true');
}finally{await browser.close();child.kill();}
