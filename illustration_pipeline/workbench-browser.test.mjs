import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.env.PYTHON||'python3',['illustration_pipeline/workbench_browser_fixture.py'],{cwd:root,env:{...process.env,ILLUSTRATION_BROWSER_QA:'1'}});
child.stderr.on('data',value=>process.stderr.write(value));
const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('FIXTURE_START_TIMEOUT')),15000);readline.createInterface({input:child.stdout}).on('line',line=>{try{const d=JSON.parse(line);if(d.port){clearTimeout(timeout);resolve(d.port)}}catch{}});child.on('exit',code=>reject(Error('FIXTURE_EXIT_'+code)));});
let channel;try{execFileSync('which',['google-chrome'],{stdio:'ignore'});channel='chrome'}catch{}
const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
try{
 for(const viewport of [{width:393,height:852},{width:1280,height:900}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:'+port+'/novel2/illustrations.html');
  await page.locator('#source').setInputFiles({name:'story.md',mimeType:'text/markdown',buffer:Buffer.from('An adult archivist stands by the sea.\n\n[[IMAGE:arrival]]\n\nShe enters a quiet room.\n\n[[IMAGE:archive]]')});
  await page.locator('#instructions').setInputFiles({name:'instructions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,content_type:'mystery',format:'portrait',characters:{},locations:{},scenes:{}}))});
  await page.locator('#prepare').click();await page.locator('#jobPanel').waitFor({state:'visible'});
  assert.equal(await page.locator('.frame').count(),2);assert(await page.locator('#export').isDisabled());
  await page.locator('#generate').click();await page.getByRole('button',{name:'Кадр соответствует сцене',exact:true}).first().waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.frame img').length===2&&[...document.querySelectorAll('.frame img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.getByRole('button',{name:'Кадр соответствует сцене',exact:true}).first().click();
  await page.getByRole('button',{name:'Кадр соответствует сцене',exact:true}).first().click();
  await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  const download=page.waitForEvent('download');await page.locator('#export').click();assert.equal((await download).suggestedFilename(),'novel_illustrated.docx');
  await page.reload();await page.locator('#jobPanel').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelectorAll('.frame img').length===2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await context.close();
 }
 const blocked=await browser.newContext({viewport:{width:393,height:852}});const page=await blocked.newPage();
 await page.route('https://telegram.org/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('**/novel2/api/illustrations/configuration',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,configured:true,authenticated:false,status:403})}));
 await page.goto('http://127.0.0.1:'+port+'/novel2/illustrations.html');
 await page.locator('#source').setInputFiles({name:'blocked.md',mimeType:'text/markdown',buffer:Buffer.from('A quiet archive room.\n\n[[IMAGE:frame]]')});
 await page.locator('#instructions').setInputFiles({name:'instructions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,content_type:'editorial'}))});
 await page.locator('#prepare').click();await page.locator('#jobPanel').waitFor({state:'visible'});
 assert(await page.locator('#generate').isDisabled());assert((await page.locator('#providerStatus').innerText()).includes('OpenRouter'),'Provider denial remains visible after upload');
 await blocked.close();
 console.log('ILLUSTRATION_WORKBENCH_BROWSER_OK upload instructions markers generation review export reload mobile desktop');
}finally{await browser.close();child.kill();}
