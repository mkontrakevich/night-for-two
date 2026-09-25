import assert from 'node:assert/strict';
import {normalizeChoice,compatibleSpace,rankNovelty,generatePersonalIdea,semanticSignature} from '../src/night-core.js';
import {fallbackStoryInterview,generateStoryInterview,normalizeStoryAnswers,storyModeCategories,storyModePermissions} from '../src/night-story-interview.js';


const romanceInterview=fallbackStoryInterview('romance');
assert.equal(romanceInterview.mode,'romance');
assert.equal(romanceInterview.questions.length,3);
assert(storyModeCategories('hardcore').includes('fantasy'));
assert(!storyModePermissions('romance').includes('closer'));
const normalizedStory=normalizeStoryAnswers({[romanceInterview.questions[0].id]:romanceInterview.questions[0].options[0].key,bad:'x'},romanceInterview);
assert.equal(Object.keys(normalizedStory).length,1);
const generatedInterview=await generateStoryInterview({mode:'bold',relationshipProfile:{},generate:async()=>JSON.stringify({title:'Новая игра',premise:'Вечер начинается с неожиданного приватного поворота и постепенно становится смелее.',questions:[{id:'scene',title:'Где начинается история?',options:[{key:'home',label:'Дома'},{key:'hotel',label:'В отеле'}]},{id:'lead',title:'Кто ведёт?',options:[{key:'me',label:'Я'},{key:'partner',label:'Партнёр'}]},{id:'twist',title:'Что меняет привычный сценарий?',options:[{key:'role',label:'Новая роль'},{key:'sensory',label:'Новые ощущения'}]}]} )});
assert.equal(generatedInterview.mode,'bold');
assert.equal(generatedInterview.questions.length,3);

const a=normalizeChoice({categories:['caress','play'],tempo:'slow',level:'uninhibited',permissions:['kiss','massage','words'],boundaries:['roleplay']});
const b=normalizeChoice({categories:['caress','experiment'],tempo:'direct',level:'open',permissions:['kiss','massage','touch'],boundaries:[]});
const space=compatibleSpace(a,b);
assert.equal(space.ceiling,1);
assert.deepEqual(space.tempos,['slow','direct']);
assert.deepEqual(space.permissions,['kiss','massage']);
assert.deepEqual(space.sharedCategories,['caress']);
assert(space.candidates.some(x=>x.practice==='kiss'));
assert(!space.candidates.some(x=>x.practice==='intimacy'));
assert(!space.candidates.some(x=>x.practice==='roleplay'));

const signature=semanticSignature({practice:'kiss',mechanic:'alternating',context:'home'});
const options=rankNovelty(space,[{signature,practice:'kiss',reaction:'liked'}]);
assert(!options.some(x=>x.signature===signature));
assert(!rankNovelty(space,[{practice:'kiss',reaction:'no'}]).some(x=>x.practice==='kiss'));

const generated=await generatePersonalIdea({space,history:[],preferences:{eveningMode:'bold',stage:'main',noveltyNonce:'test-nonce',relationshipProfile:{dynamics:[{key:'playful',description:'Игривый формат'}]},mutualWishes:['roleplay'],storyInterview:generatedInterview,storyAnswers:{a:{scene:'home',lead:'me',twist:'role'},b:{scene:'hotel',lead:'partner',twist:'role'}}},generate:async request=>{
  if(request.requestName==='night_personal_safety')return JSON.stringify({safe:true,signature:JSON.parse(request.messages[1].content).idea.signature});
  assert.equal(request.requestName,'night_personal_idea');
  const p=JSON.parse(request.messages[1].content);
  assert.deepEqual(p.tempos,['slow','direct']);
  assert.equal(p.eveningMode,'bold');
  assert.equal(p.stage,'main');
  assert.equal(p.noveltyNonce,'test-nonce');
  assert.equal(request.skipDatabaseContext,false);
  assert.equal(p.storyInterview.mode,'bold');
  assert.equal(p.storyAnswers.a.twist,'role');
  assert.equal(p.storyAnswers.b.twist,'role');
  return JSON.stringify({signature:p.options[0].signature,title:'Новый общий момент',text:'Начните с комфортного для обоих действия и меняйте темп только по взаимному желанию. Любой может остановиться.',semantic_summary:'Короткое взаимное действие с переменой темпа.'});
}});
assert.equal(generated.practice,'kiss');
assert(generated.fingerprint.length>10);
await assert.rejects(generatePersonalIdea({space,generate:async request=>request.requestName==='night_personal_safety'?JSON.stringify({safe:false,signature:JSON.parse(request.messages[1].content).idea.signature}):JSON.stringify({signature, title:'Новая сцена',text:'Предложите друг другу мягкий вариант и остановитесь, если кому-то станет некомфортно.',semantic_summary:'Мягкое взаимное действие с правом остановиться.'})}),/UNVERIFIED/);
await assert.rejects(generatePersonalIdea({space,generate:async()=>JSON.stringify({signature:'intimacy|guided|private|mutual',title:'Bad',text:'Слишком смелая практика за пределами ваших текущих разрешений.',semantic_summary:'Недопустимое действие за пределами разрешений.'})}),/OUTSIDE_BOUNDARIES/);
assert.throws(()=>normalizeChoice({categories:[],tempo:'slow',level:'bold',permissions:[],boundaries:[]}),/CATEGORIES_REQUIRED/);
console.log('NIGHT_PERSONAL_CORE_OK');
