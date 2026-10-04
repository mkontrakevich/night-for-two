import fs from 'node:fs/promises';
import {completeAIText} from './ai/provider-router.js';

const PERMISSIONS=new Set(['words','embrace','kiss','touch','skip']);
let interactionSkillCache='';
async function interactionSkillExcerpt(){
  if(interactionSkillCache)return interactionSkillCache;
  try{
    const raw=await fs.readFile(new URL('../skills/couple-space/intimate-narrative/SKILL.md',import.meta.url),'utf8');
    const sections=['## 3. Storyteller behavior','## 17A. Dialogue contract','## 17C. Prose complexity contract'],chunks=[];
    for(const title of sections){const start=raw.indexOf(title);if(start<0)continue;const next=raw.indexOf('\n## ',start+4);chunks.push(raw.slice(start,next<0?raw.length:next));}
    interactionSkillCache=chunks.join('\n\n').slice(0,9000);
  }catch(error){console.warn('NIGHT_INTERACTION_SKILL_LOAD_FAILED',String(error?.message||error).slice(0,160));interactionSkillCache='';}
  return interactionSkillCache;
}


function parse(raw){
  if(raw&&typeof raw==='object')return raw;
  return JSON.parse(String(raw||'').replace(/^```(?:json)?\s*|\s*```$/g,''));
}

function fallback(page={}){
  const choices=[
    {permission:'words',title:'Одна фраза',action_text:'Остановитесь на минуту и по очереди скажите, какая деталь этой главы зацепила сильнее всего. Можно ничего не объяснять и сразу продолжить чтение.',simulation_text:'Герои задержались у границы следующей сцены и каждый назвал одну деталь, которую не хотел отпускать. После этого история двинулась дальше.'},
    {permission:'embrace',title:'Пауза между главами',action_text:'Если обоим комфортно, обнимитесь на несколько спокойных вдохов и затем продолжайте чтение. Любой может просто перейти к следующей странице.',simulation_text:'Герои ненадолго остановились и обнялись, будто проверяя, готовы ли идти дальше. Пауза закончилась сама собой, и следующая глава началась.'},
    {permission:'touch',title:'Ладонь',action_text:'Если обоим комфортно, на несколько секунд соприкоснитесь ладонями и продолжайте читать. Это предложение можно пропустить без объяснений.',simulation_text:'Герои молча соприкоснулись ладонями. Этого короткого жеста оказалось достаточно, чтобы напряжение сцены изменилось и путь продолжился.'}
  ];
  return choices[Math.abs(Number(page.page_no)||0)%choices.length];
}

export async function createNovelInteraction({page={},novel={}}={}){
  const safeFallback=fallback(page);
  const narrativeSkill=await interactionSkillExcerpt();
  try{
    const raw=await completeAIText({
      contour:'wife',
      requestName:'night_novel_interaction',
      skipDatabaseContext:true,
      temperature:.45,
      maxTokens:420,
      messages:[
        {role:'system',content:`Ты создаёшь одну короткую интерактивную паузу между главами художественного романа для двух совершеннолетних партнёров.

${narrativeSkill?`КАНОНИЧЕСКИЙ NARRATIVE SKILL:\n${narrativeSkill}\n`:``}

Действие должно вытекать из конкретной главы, а не быть универсальной романтической карточкой. Используй предмет, реплику, конфликт, выбор или мотив именно этой сцены. Формулируй точно и просто: без цепочек эпитетов, декоративной чувственности и повторения настроения главы другими словами.

Верни только JSON с полями permission, title, action_text, simulation_text. permission только words, embrace, kiss, touch или skip. action_text — необязательное предложение реальным читателям, максимум 1–2 минуты, без давления, без утверждения согласия, с явной возможностью пропустить. simulation_text — короткое продолжение только про героев романа: ассистент сам выбирает, как это же действие произошло в вымышленной сцене, не утверждая, что реальные читатели что-либо сделали. Не добавляй откровенные сексуальные инструкции, наготу, предметы, рискованные действия или цитаты личной переписки.`},
        {role:'user',content:JSON.stringify({novel_title:String(novel.title||'').slice(0,160),chapter:String(page.chapter_title||'').slice(0,160),page_text:String(page.body||'').slice(-1800)})}
      ]
    });
    const card=parse(raw);
    const permission=String(card?.permission||'');
    const title=String(card?.title||'').trim();
    const actionText=String(card?.action_text||'').trim();
    const simulationText=String(card?.simulation_text||'').trim();
    if(!PERMISSIONS.has(permission)||title.length<3||title.length>90||actionText.length<30||actionText.length>520||simulationText.length<40||simulationText.length>700)throw new Error('NIGHT_NOVEL_INTERACTION_INVALID');
    return {permission,title,action_text:actionText,simulation_text:simulationText};
  }catch(error){
    console.warn('NIGHT_NOVEL_INTERACTION_FALLBACK',String(error?.message||error).slice(0,120));
    return safeFallback;
  }
}
