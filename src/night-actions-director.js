import {completeAIText} from './ai/provider-router.js';
import {actionScene,fallbackStoryCard} from './night-actions-core.js';
import {VARIETY_MATRIX} from './night-core.js';
import {nightReferencePromptDigest} from './night-reference-collection.js';

function parse(raw){return typeof raw==='object'?raw:JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));}
export async function directStoryAction({stage,permission,snapshot,relationshipContext={},history=[],generate=completeAIText}={}){
  const fallback=fallbackStoryCard(stage,permission,snapshot,relationshipContext);
  if(snapshot?.kind!=='generated_story'||permission==='skip')return fallback;
  const scene=actionScene(stage,snapshot),rank={words:0,embrace:1,kiss:2,touch:3},allowed=VARIETY_MATRIX.filter(x=>rank[x.permission]!==undefined&&rank[x.permission]<=rank[permission]).flatMap(x=>x.mechanics.map(mechanic=>({practice:x.practice,mechanic,context:x.contexts[0],level:x.level}))).slice(0,28);
  try{
    const raw=await generate({contour:'wife',requestName:'night_action_from_story',skipDatabaseContext:true,temperature:.5,maxTokens:350,messages:[
      {role:'system',content:'Ты — Couple Adventure Director для двух совершеннолетних партнёров. Это отдельное реальное совместное действие, а НЕ выбор персонажа в книге. Выбери ровно одну пару practice+mechanic только из allowed и создай конкретное задание на 2–5 минут, связанное с мотивом текущей сцены. Используй механику как композиционный принцип, не копируй готовые тексты. Не повторяй practice+mechanic из previous. permission — жёсткий потолок: words только речь/роль/визуальный выбор без телесного действия; embrace — не выше объятия; kiss — не выше поцелуя; touch — допускает безопасное прикосновение в рамках выбранной практики. Никакого давления, опасных или публичных действий. Любой может остановиться. Верни JSON {"practice":"...","mechanic":"...","title":"...","text":"..."}.'},
      {role:'user',content:JSON.stringify({scene:{chapter:scene.chapter,summary:scene.story},permission,allowed,referenceMechanics:nightReferencePromptDigest(),previous:(history||[]).slice(-8),context:{preferences:(relationshipContext.preferences||[]).filter(x=>x.confidence>=.7).slice(0,3).map(x=>({key:x.key,value:x.value}))}})}
    ]});
    const card=parse(raw),practice=String(card?.practice||''),mechanic=String(card?.mechanic||''),title=String(card?.title||'').trim(),text=String(card?.text||'').trim();
    if(!allowed.some(x=>x.practice===practice&&x.mechanic===mechanic)||title.length<3||title.length>80||text.length<50||text.length>600)throw new Error('ACTION_GENERATION_INVALID');
    const audit=parse(await generate({contour:'wife',requestName:'night_action_safety',skipDatabaseContext:true,temperature:0,maxTokens:100,messages:[
      {role:'system',content:'Проверь действие. safe=true только если оно связано с данной сценой, конкретно выполнимо, не превышает permission (words: только слова; embrace: объятие; kiss: поцелуй; touch: контакт ладоней), не цитирует личные сообщения и допускает остановку. При сомнении safe=false. Верни только JSON {"safe":true|false}.'},
      {role:'user',content:JSON.stringify({permission,scene:scene.story,card:{title,text}})}
    ]}));
    if(audit.safe!==true)throw new Error('ACTION_GENERATION_UNVERIFIED');
    return {title,text,scene:scene.id,permission,practice,mechanic};
  }catch(error){console.warn('night_action_fallback',String(error?.message||error).slice(0,100));return fallback;}
}
