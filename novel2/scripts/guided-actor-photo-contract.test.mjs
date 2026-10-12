import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {ACTOR_VIEW_SPEC,actorViewPrompt} from '../../cloudflare/novel2-preview/src/actor-sheet-compose.js';

const read=async path=>fs.readFile(new URL('../../'+path,import.meta.url),'utf8');
const [ui,host,app,actor,cloud,visual]=await Promise.all([
 read('novel2/public/index.html'),read('novel2/public/noir-host.js'),
 read('novel2/src/app.js'),read('cloudflare/novel2-preview/src/native-actor.js'),
 read('cloudflare/novel2-preview/src/index.js'),read('novel2/src/visual-engine.js')
]);
const active=[ui,host,app,actor,cloud,visual];
for(const source of active){
 assert.doesNotMatch(source,/bodysuit|body suit|телесн.{0,8}трико|ONE_TO_THREE_PHOTOS_REQUIRED|MAX_THREE_PHOTOS/i,
   'all active flows must be free of retired outfit and 3-photo limits');
}
assert.equal(ACTOR_VIEW_SPEC.length,4);
for(const view of ACTOR_VIEW_SPEC){
 const prompt=actorViewPrompt({view,role:'A',identityLock:'LOCKED_NATURAL_FEATURES'});
 assert.match(prompt,/IVORY SILK/);
 assert.match(prompt,/opaque layers|secure/i);
 assert.doesNotMatch(prompt,/bodysuit|body suit|underwear styling|nudity desired/i);
 assert.match(prompt,/LOCKED_NATURAL_FEATURES/);
 assert.match(prompt,/SINGLE photograph/);
}
const a=ui.indexOf('<script>')+8,b=ui.indexOf('</script>',a);
assert.ok(a>8&&b>a);
new vm.Script(ui.slice(a,b),{filename:'novel2/public/index.html'});
const start=ui.indexOf('function actorReferenceFields(){'),end=ui.indexOf('function renderCharacterDetail(',start);
assert.ok(start>=0&&end>start);
const snippets=ui.slice(start,end);
const fake=vm.runInNewContext(snippets+';actorReferenceFields();',{});
for(const word of ['Анфас','Профиль · 90°','Полный рост · спереди','Полный рост · сзади'])assert.ok(fake.includes(word),word);
assert.equal((fake.match(/data-actor-angle=/g)||[]).length,4);
assert.match(ui,/function chosenActorPhotos/);
assert.match(ui,/filesToDataUrls\(files\)/);
assert.match(ui,/\.slice\(0,4\)/);
assert.match(app,/reference_images\.length>4/);
assert.match(app,/reference_images\.slice\(0,4\)/);
assert.match(actor,/photos\.length>4/);
assert.match(cloud,/work\.refs\.slice\(0,4\)/);
console.log('NOVEL2_GUIDED_ACTOR_PHOTOS_OK four inputs, four refs, four independent prompts, silk wardrobe, zero retired wording');
