import fs from 'node:fs/promises';
import {completeAIText} from './ai/provider-router.js';

const PERMISSIONS=new Set(['words','embrace','kiss','touch','skip']);
let interactionSkillCache='';
async function interactionSkillExcerpt(){
  if(interactionSkillCache)return interactionSkillCache;
  try{
    const raw=await fs.readFile(new URL('../skills/couple-space/intimate-narrative/SKILL.md',import.meta.url),'utf8');
    const sections=['## 3. Storyteller behavior','## 17A. Dialogue contract','## 17C. Prose complexity contract','## 17D. Character interaction and purposeful dialogue contract','## 17E. Consequential player-choice contract'],chunks=[];
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
    {version:2,permission:'words',heat:1,title:'Секрет сцены',setup:'Оставьте телефон рядом и выберите одну деталь только что прочитанной главы.',action_text:'Один задаёт короткий вопрос от лица своего героя, второй отвечает от лица другого — но ответ должен содержать одну настоящую мысль о вас двоих. Затем поменяйтесь ролями.',alternative_text:'Если не хочется говорить от лица героев, каждый называет одну деталь главы, которую хотел бы перенести в ваш вечер.',simulation_text:'Герои задержались на границе следующей сцены и впервые ответили друг другу без заготовленных слов.'},
    {version:2,permission:'kiss',heat:2,title:'Стоп-кадр',setup:'Выберите момент главы, в котором расстояние между героями стало важнее слов.',action_text:'Встаньте так, как вы представляете этот кадр. Один начинает движение, второй решает, сократить ли дистанцию. Если желание взаимно — завершите момент поцелуем и только после этого продолжайте читать.',alternative_text:'Оставьте дистанцию и вместо поцелуя скажите друг другу по одной фразе, которую герои не решились произнести.',simulation_text:'Герои остановились слишком близко, чтобы продолжать притворяться, будто эта дистанция ничего не значит.'},
    {version:2,permission:'touch',heat:2,title:'Повторить жест',setup:'Найдите в сцене жест, предмет или движение, которое можно безопасно перенести из истории в комнату.',action_text:'Один воспроизводит этот жест без слов, второй отвечает своим движением. Продолжайте только пока обоим интересно; затем поменяйтесь ролями.',alternative_text:'Если не хочется повторять жест буквально, придумайте его символическую версию только руками.',simulation_text:'Герои повторили знакомый жест иначе, и его смысл изменился вместе с ними.'}
  ];
  return choices[Math.abs(Number(page.page_no)||0)%choices.length];
}

export async function createNovelInteraction({page={},novel={}}={}){
  const safeFallback=fallback(page);
  const narrativeSkill=await interactionSkillExcerpt();
  try{
    const raw=await completeAIText({
      contour:'wife',requestName:'night_novel_couple_challenge',skipDatabaseContext:true,temperature:.62,maxTokens:650,
      messages:[
        {role:'system',content:`Ты создаёшь одно короткое игровое задание Couple Adventure для двух совершеннолетних партнёров внутри художественного романа.

${narrativeSkill?`КАНОНИЧЕСКИЙ NARRATIVE SKILL:\n${narrativeSkill}\n`:``}

Это НЕ «момент выбора» и не универсальная романтическая пауза. Задание должно переносить конкретный конфликт, предмет, реплику, жест или ситуацию только что прочитанной главы в реальное взаимодействие пары на 2–5 минут. Оно должно ощущаться как часть приключения: кто начинает, что конкретно сделать, как второй отвечает, чем заканчивается раунд.

Верни только JSON: {"version":2,"permission":"words|embrace|kiss|touch|massage","heat":1|2|3,"title":"...","setup":"...","action_text":"...","alternative_text":"...","simulation_text":"..."}.

Требования: title короткий и предметный; setup связывает задание с конкретной сценой; action_text — одно выполнимое действие для пары; alternative_text — полноценная мягкая альтернатива, а не «ничего не делать»; simulation_text — как мотив продолжается только между вымышленными героями. Не повторяй банальные «почувствуйте близость», «несколько вдохов», «скажите что-то от сердца». Не утверждай согласие за участников. Любой вариант можно пропустить. Не добавляй графические сексуальные инструкции, опасные практики или публичные действия.`},
        {role:'user',content:JSON.stringify({novel_title:String(novel.title||'').slice(0,160),chapter:String(page.chapter_title||'').slice(0,160),page_text:String(page.body||'').slice(-2600)})}
      ]
    });
    const card=parse(raw),permission=String(card?.permission||''),heat=Math.max(1,Math.min(3,Number(card?.heat)||1)),title=String(card?.title||'').trim(),setup=String(card?.setup||'').trim(),actionText=String(card?.action_text||'').trim(),alternativeText=String(card?.alternative_text||'').trim(),simulationText=String(card?.simulation_text||'').trim();
    if(!PERMISSIONS.has(permission)||title.length<3||title.length>90||setup.length<20||setup.length>420||actionText.length<50||actionText.length>700||alternativeText.length<40||alternativeText.length>600||simulationText.length<40||simulationText.length>700)throw new Error('NIGHT_NOVEL_CHALLENGE_INVALID');
    return {version:2,permission,heat,title,setup,action_text:actionText,alternative_text:alternativeText,simulation_text:simulationText};
  }catch(error){console.warn('NIGHT_NOVEL_CHALLENGE_FALLBACK',String(error?.message||error).slice(0,120));return safeFallback;}
}
