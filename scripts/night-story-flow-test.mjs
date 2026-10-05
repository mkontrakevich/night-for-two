import assert from 'node:assert/strict';
import {STORY_ARC,STORY_MAX_CHOICE_STAGE,STORY_PAGE_PLAN,STORY_TOTAL_PAGES,storyArcStage,storyPageCount,storyPageOffset,initialStoryProfile,storyBlueprint,applyStoryOption,mergeStoryProfiles,generateStoryScene,storyProfileToSelection} from '../src/night-story-flow.js';

assert.equal(STORY_ARC.length,10);
assert.equal(storyArcStage(0).key,'prologue');
assert.equal(storyArcStage(9).key,'finale');
assert.equal(STORY_MAX_CHOICE_STAGE,8);
assert.equal(STORY_TOTAL_PAGES,100);
assert.equal(STORY_PAGE_PLAN.reduce((a,b)=>a+b,0),100);
assert.equal(storyPageCount(0),8);
assert.equal(storyPageCount(9),12);
assert.equal(storyPageOffset(9),88);

const romance=initialStoryProfile('romance');
const hardcore=initialStoryProfile('hardcore');
assert.equal(romance.mode,'romance');
assert.equal(hardcore.mode,'hardcore');

const prologue=storyBlueprint('bold',0,initialStoryProfile('bold'));
assert.equal(prologue.length,3);
assert(prologue.every(x=>x.key&&x.intent&&x.meta));

const deeper=applyStoryOption(initialStoryProfile('sensual'),{meta:{level:'bold',permission:'closer',tempo:'direct',leader:'alternating',novelty:'sensory'}},'sensual');
const softer=applyStoryOption(initialStoryProfile('sensual'),{meta:{level:'open',permission:'kiss',tempo:'slow',leader:'mutual',novelty:'familiar'}},'sensual');
const merged=mergeStoryProfiles(deeper,softer,'sensual');
assert.equal(merged.level,'open','Pair merge must use the softer mutually compatible level');
assert.equal(merged.permission,'kiss','Pair merge must use the softer mutually compatible permission');
assert.equal(merged.tempo,'slow','Pair merge must use the slower compatible tempo');

const sel=storyProfileToSelection(merged,'sensual');
assert.equal(sel.version,3);
assert(sel.permissions.includes('kiss'));
assert(!sel.permissions.includes('closer'));

const fake=async req=>{
  const body=JSON.parse(req.messages[1].content),pageCount=Number(body.pageCount)||10;
  const pages=Array.from({length:pageCount},(_,i)=>({id:'p'+(i+1),title:i===0?(body.final?'Финальная глава':'Глава'):'',text:Array.from({length:150},()=>((body.final?'финал':'слово')+(i+1))).join(' '),media:(i===0||i===pageCount-1)?{kind:'image',prompt:'same adult couple, key story beat on book page '+(body.pageOffset+i+1)+', cinematic romantic atmosphere, tasteful non-explicit'}:null}));
  if(body.final)return JSON.stringify({title:'Финал истории',text:'История приходит к общей кульминации и завершает начатую в прологе линию.',visual_prompt:'anonymous adult couple silhouette, candlelight, cinematic close crop',reader_pages:pages});
  return JSON.stringify({
    title:'Первая глава',
    text:'Комната остаётся той же, но расстояние между героями становится меньше. Следующий выбор определит, как именно продолжится эта линия.',
    visual_prompt:'anonymous adult couple, warm dark room, cinematic vertical close crop',
    story_identity:{world:{setting:'Старый отель у моря',time:'Поздний вечер',premise:'Двое взрослых героев оказываются связаны одной тайной номера.',hook:'Один выбор уже изменил дистанцию между ними.'},heroes:{A:{name:'Марк',role:'Архитектор, вернувшийся в закрытый отель',goal:'Понять, зачем его позвали',inner_conflict:'Он хочет довериться, но привык всё проверять',relation:'Не уверен, союзник ли второй герой',entry:'Вы возвращаетесь туда, куда обещали больше не приезжать.'},B:{name:'Ева',role:'Куратор последнего вечера отеля',goal:'Добиться от Марка решения до полуночи',inner_conflict:'Ей нужно сказать правду, не потеряв контроль',relation:'Она знает о Марке больше, чем показывает',entry:'Вы ждали его, но теперь должны решить, сколько правды открыть сразу.'}}},
    reader_pages:pages,
    interaction:{kind:'choice',prompt:'Как продолжить?',options:body.blueprint.map(x=>({key:x.key,label:'Сделать действие: '+x.key,branch_effect:'Выбранное действие '+x.key+' заметно меняет следующий ход сцены'}))}
  });
};
const scene=await generateStoryScene({mode:'bold',stage:0,profile:initialStoryProfile('bold'),history:[],relationshipProfile:{},mutualWishes:[],generate:fake});
assert.equal(scene.final,false);
assert.equal(scene.story_identity.heroes.A.name,'Марк');
assert.equal(scene.story_identity.heroes.B.name,'Ева');
assert.equal(scene.story_identity.world.setting,'Старый отель у моря');

assert.equal(scene.options.length,3);
assert.equal(scene.options[0].key,prologue[0].key);
assert(scene.options.every(x=>x.branch_effect),'Every player choice must carry a causal branch effect');
assert.equal(scene.reader_pages.length,8);
assert.equal(scene.interaction.kind,'choice','Interactive novel must stop for an in-world character decision, never replace it with a real-world task');
assert(scene.options.every(x=>x.branch_effect),'Every character decision must carry a causal consequence into the next scene');
assert.equal(scene.reader_meta.episode_page_offset,0);
assert.equal(scene.reader_meta.episode_page_total,100);
assert.equal(scene.reader_meta.chapter_page_total,8);
assert.equal(scene.reader_pages.filter(p=>p.media?.prompt).length,2,'Prologue must illustrate only two key story beats instead of every page');
assert(scene.reader_pages.some(p=>!p.media),'Transition pages must remain text-only');

let identityRepairCalls=0;
const repairFake=async req=>{
  const body=JSON.parse(req.messages[1].content||'{}');
  if(req.requestName==='night_story_identity'){
    identityRepairCalls++;
    return JSON.stringify({world:{setting:'Городской отель после закрытия',time:'Ночь',premise:'Двое взрослых героев вынуждены закончить незавершённое дело до рассвета.',hook:'Ключ от закрытого номера связывает их решения.'},heroes:{A:{name:'Алекс',role:'Архитектор проекта реконструкции',goal:'Понять, почему его вернули в отель',inner_conflict:'Он боится снова довериться неверному человеку',relation:'Считает второго героя единственным свидетелем старой ошибки',entry:'Вы входите в пустой холл и сразу замечаете знакомый ключ на стойке.'},B:{name:'Мира',role:'Управляющая закрывающегося отеля',goal:'Закончить дело до рассвета',inner_conflict:'Она скрывает часть правды, чтобы не потерять контроль',relation:'Знает, что Алекс может разрушить её план или спасти его',entry:'Вы ждали Алекса у стойки и уже решили, с чего начнёте разговор.'}}});
  }
  const pageCount=Number(body.pageCount)||8;
  const pages=Array.from({length:pageCount},(_,i)=>({id:'r'+(i+1),title:i===0?'Пролог':'',text:Array.from({length:150},()=>('сцена'+(i+1))).join(' '),media:(i===0||i===pageCount-1)?{kind:'image',prompt:'same adult fictional couple, cinematic hotel interior, vertical frame'}:null}));
  return JSON.stringify({
    title:'Ночной ключ',
    text:'Двое героев встречаются в закрытом отеле, и первый выбор должен определить их дальнейший союз.',
    visual_prompt:'adult fictional couple in a closed hotel lobby, cinematic vertical frame',
    story_identity:{world:{setting:'Городской отель после закрытия'},heroes:{A:{name:'Алекс'},B:{name:'Мира'}}},
    reader_pages:pages,
    interaction:{kind:'choice',prompt:'Что сделать первым?',options:body.blueprint.map(x=>({key:x.key,label:'Выбрать действие '+x.key,branch_effect:'Действие '+x.key+' меняет следующий эпизод'}))}
  });
};
const repairedScene=await generateStoryScene({mode:'bold',stage:0,profile:initialStoryProfile('bold'),history:[],relationshipProfile:{},mutualWishes:[],generate:repairFake});
assert.equal(identityRepairCalls,1,'Incomplete prologue identity must trigger one dedicated identity repair call');
assert.equal(repairedScene.story_identity.heroes.A.name,'Алекс');
assert.equal(repairedScene.story_identity.heroes.B.name,'Мира');
assert.equal(repairedScene.story_identity.world.setting,'Городской отель после закрытия');


let readerRepairSceneCalls=0;
const readerRepairFake=async req=>{
  if(req.requestName==='night_story_identity'){
    return JSON.stringify({world:{setting:'Ночной вокзал',time:'После полуночи',premise:'Двое взрослых героев пытаются успеть к последнему поезду и разобраться в старой тайне.',hook:'У них остался один билет и один нерешённый вопрос.'},heroes:{A:{name:'Илья',role:'Инженер-проектировщик',goal:'Понять, кто изменил маршрут',inner_conflict:'Он боится довериться догадке',relation:'Считает второго героя единственным союзником',entry:'Вы стоите у закрытой платформы и слышите приближение поезда.'},B:{name:'Анна',role:'Архивист вокзала',goal:'Передать Илье найденный документ',inner_conflict:'Она не уверена, что правда не разрушит их план',relation:'Знает больше, чем успела сказать',entry:'Вы держите документ, который может всё изменить до отправления поезда.'}}});
  }
  readerRepairSceneCalls++;
  const body=JSON.parse(req.messages[1].content||'{}'),expected=Number(body.pageCount)||8;
  assert.equal(Boolean(body.validationRepair),readerRepairSceneCalls>1,'Retry payload must explain the previous structural validation failure');
  const count=readerRepairSceneCalls===1?expected-1:expected;
  const pages=Array.from({length:count},(_,i)=>({
    id:'repair_'+(i+1),
    title:i===0?'Последний поезд':'',
    text:Array.from({length:150},()=>('вагон'+(i+1))).join(' '),
    media:(i===0||i===count-1)?{kind:'image',prompt:'same adult fictional couple, night railway platform, cinematic vertical frame'}:null
  }));
  return JSON.stringify({
    title:'Последний поезд',
    text:'Двое героев оказываются на ночном вокзале перед решением, которое изменит их маршрут.',
    visual_prompt:'adult fictional couple on a night railway platform, cinematic vertical frame',
    story_identity:{world:{setting:'Ночной вокзал',time:'После полуночи',premise:'Двое взрослых героев пытаются успеть к последнему поезду и разобраться в старой тайне.',hook:'У них остался один билет и один нерешённый вопрос.'},heroes:{A:{name:'Илья',role:'Инженер-проектировщик',goal:'Понять, кто изменил маршрут',inner_conflict:'Он боится довериться догадке',relation:'Считает второго героя единственным союзником',entry:'Вы стоите у закрытой платформы и слышите приближение поезда.'},B:{name:'Анна',role:'Архивист вокзала',goal:'Передать Илье найденный документ',inner_conflict:'Она не уверена, что правда не разрушит их план',relation:'Знает больше, чем успела сказать',entry:'Вы держите документ, который может всё изменить до отправления поезда.'}}},
    reader_pages:pages,
    interaction:{kind:'choice',prompt:'Что сделать до прибытия поезда?',options:body.blueprint.map(x=>({key:x.key,label:'Сделать '+x.key,branch_effect:'Решение '+x.key+' меняет следующий эпизод'}))}
  });
};
const readerRepaired=await generateStoryScene({mode:'bold',stage:0,profile:initialStoryProfile('bold'),history:[],relationshipProfile:{},mutualWishes:[],generate:readerRepairFake});
assert.equal(readerRepairSceneCalls,2,'Malformed page count must trigger a targeted structural retry instead of failing the story');
assert.equal(readerRepaired.reader_pages.length,8);
assert.equal(readerRepaired.reader_pages.filter(p=>p.media?.prompt).length,2);


let shortSceneCalls=0,proseRepairCalls=0;
const shortProseRepairFake=async req=>{
  if(req.requestName==='night_story_identity'){
    return JSON.stringify({world:{setting:'Закрытая библиотека',time:'Поздний вечер',premise:'Двое взрослых героев должны найти спрятанное письмо до закрытия здания.',hook:'Последний свет гаснет через несколько минут.'},heroes:{A:{name:'Лев',role:'Реставратор старых книг',goal:'Найти письмо первым',inner_conflict:'Он не уверен, можно ли доверять найденной подсказке',relation:'Считает второго героя необходимым союзником',entry:'Вы закрываете тяжёлую дверь читального зала и слышите щелчок старого замка.'},B:{name:'Вера',role:'Архивист редкого фонда',goal:'Понять, почему письмо скрывали',inner_conflict:'Она боится, что правда разрушит их договорённость',relation:'Знает, что Лев не рассказал ей всё',entry:'Вы держите каталог, в котором одна карточка явно подменена.'}}});
  }
  if(req.requestName==='night_story_reader_repair'){
    proseRepairCalls++;
    const body=JSON.parse(req.messages[1].content||'{}');
    const source=body.SOURCE_SCENE;
    const expected=Number(body.REQUIRED_PAGE_COUNT)||8;
    const pages=Array.from({length:expected},(_,i)=>({
      id:'expanded_'+(i+1),
      title:i===0?'Закрытая библиотека':'',
      text:Array.from({length:150},()=>('абзац'+(i+1))).join(' '),
      media:(i===0||i===expected-1)?{kind:'image',prompt:'medium shot → two adult fictional characters searching a closed library → restrained body language → tense quiet atmosphere → period coats and paper catalog cards → historic reading hall → warm lamps at night → 50mm lens → muted cinematic film palette → stable character identity lock → preserve library and wardrobe continuity'}:null
    }));
    return JSON.stringify({
      reader_pages:pages,
      title:'CORRUPTED TITLE MUST BE IGNORED',
      story_identity:{world:{},heroes:{}},
      interaction:{kind:'choice',prompt:''},
      options:[]
    });
  }
  shortSceneCalls++;
  const body=JSON.parse(req.messages[1].content||'{}'),expected=Number(body.pageCount)||8;
  const pages=Array.from({length:expected},(_,i)=>({
    id:'short_'+(i+1),
    title:i===0?'Закрытая библиотека':'',
    text:Array.from({length:25},()=>('коротко'+(i+1))).join(' '),
    media:i===0?{kind:'image',prompt:'library scene'}:null
  }));
  return JSON.stringify({
    title:'Закрытая библиотека',
    text:'Двое героев остаются в читальном зале перед первым решением.',
    visual_prompt:'two adult fictional characters in a historic library at night, cinematic vertical frame',
    story_identity:{world:{setting:'Закрытая библиотека',time:'Поздний вечер',premise:'Двое взрослых героев должны найти спрятанное письмо до закрытия здания.',hook:'Последний свет гаснет через несколько минут.'},heroes:{A:{name:'Лев',role:'Реставратор старых книг',goal:'Найти письмо первым',inner_conflict:'Он не уверен, можно ли доверять найденной подсказке',relation:'Считает второго героя необходимым союзником',entry:'Вы закрываете тяжёлую дверь читального зала и слышите щелчок старого замка.'},B:{name:'Вера',role:'Архивист редкого фонда',goal:'Понять, почему письмо скрывали',inner_conflict:'Она боится, что правда разрушит их договорённость',relation:'Знает, что Лев не рассказал ей всё',entry:'Вы держите каталог, в котором одна карточка явно подменена.'}}},
    reader_pages:pages,
    interaction:{kind:'choice',prompt:'Что сделать первым?',options:body.blueprint.map(x=>({key:x.key,label:'Выбрать '+x.key,branch_effect:'Выбор '+x.key+' меняет следующий эпизод'}))}
  });
};
const proseRepaired=await generateStoryScene({mode:'bold',stage:0,profile:initialStoryProfile('bold'),history:[],relationshipProfile:{},mutualWishes:[],generate:shortProseRepairFake});
assert.equal(shortSceneCalls,3,'Short prose must exhaust structural scene retries before dedicated prose repair');
assert.equal(proseRepairCalls,1,'Short reader prose must trigger the dedicated reader repair editor');
assert.equal(proseRepaired.reader_pages.length,8);
assert(proseRepaired.reader_pages.every(p=>p.text.length>=650),'Dedicated repair must expand every reader page to production prose length');
assert.equal(proseRepaired.reader_pages.filter(p=>p.media?.prompt).length,2);
assert.equal(proseRepaired.title,'Закрытая библиотека','Reader repair must not overwrite canonical scene title');
assert.equal(proseRepaired.story_identity.heroes.A.name,'Лев','Reader repair must not overwrite Story Identity');
assert(proseRepaired.options.length>=2,'Reader repair must preserve canonical branching options');

const finale=await generateStoryScene({mode:'bold',stage:9,profile:merged,history:[scene],relationshipProfile:{},mutualWishes:[],generate:fake,final:true});
assert.equal(finale.final,true);
assert.equal(finale.options.length,0);
assert.equal(finale.reader_pages.length,12);
assert.equal(finale.reader_meta.finale,true);
assert.equal(finale.reader_meta.episode_page_offset,88);
assert.equal(finale.reader_meta.episode_page_total,100);
assert.equal(finale.reader_pages.filter(p=>p.media?.prompt).length,2,'Finale must keep only two key illustrations');

console.log('NIGHT_STORY_FLOW_OK arc=true pair_merge=true generated_scene=true finale=true');
