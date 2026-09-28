import {completeAIText} from './ai/provider-router.js';
import {actionScene,fallbackStoryCard} from './night-actions-core.js';

function parse(raw){return typeof raw==='object'?raw:JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));}
export async function directStoryAction({stage,permission,snapshot,relationshipContext={},generate=completeAIText}={}){
  const fallback=fallbackStoryCard(stage,permission,snapshot,relationshipContext);
  if(snapshot?.kind!=='generated_story'||permission==='skip')return fallback;
  const scene=actionScene(stage,snapshot);
  try{
    const raw=await generate({contour:'wife',requestName:'night_action_from_story',skipDatabaseContext:true,temperature:.5,maxTokens:350,messages:[
      {role:'system',content:'Ты адаптируешь одно короткое физическое действие для двух совершеннолетних партнёров после прочитанной сцены. Верни JSON {"title":"...","text":"..."}. Действие должно конкретно продолжать данный эпизод в реальности и занимать 1–3 минуты. permission=words означает только речь, embrace допускает объятие, kiss допускает поцелуй, touch допускает контакт ладоней. Не выходи за permission, не добавляй других прикосновений, наготы, секса, предметов, требующих покупки, давления или проверки согласия по умолчанию. Можно остановиться без объяснений. Не цитируй личную переписку и не упоминай выводы о паре.'},
      {role:'user',content:JSON.stringify({scene:{chapter:scene.chapter,summary:scene.story},permission,context:{preferences:(relationshipContext.preferences||[]).filter(x=>x.confidence>=.7).slice(0,3).map(x=>({key:x.key,value:x.value}))}})}
    ]});
    const card=parse(raw),title=String(card?.title||'').trim(),text=String(card?.text||'').trim();
    if(title.length<3||title.length>80||text.length<50||text.length>500)throw new Error('ACTION_GENERATION_INVALID');
    const audit=parse(await generate({contour:'wife',requestName:'night_action_safety',skipDatabaseContext:true,temperature:0,maxTokens:100,messages:[
      {role:'system',content:'Проверь действие. safe=true только если оно связано с данной сценой, конкретно выполнимо, не превышает permission (words: только слова; embrace: объятие; kiss: поцелуй; touch: контакт ладоней), не цитирует личные сообщения и допускает остановку. При сомнении safe=false. Верни только JSON {"safe":true|false}.'},
      {role:'user',content:JSON.stringify({permission,scene:scene.story,card:{title,text}})}
    ]}));
    if(audit.safe!==true)throw new Error('ACTION_GENERATION_UNVERIFIED');
    return {title,text,scene:scene.id,permission};
  }catch(error){console.warn('night_action_fallback',String(error?.message||error).slice(0,100));return fallback;}
}
