/* Secret Host runtime:
 * The prompt is versioned in SKILL.md and loaded server-side.
 * Stage transitions and photo approval are controlled exclusively by the app.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeGuestPlace,buildLobbyNarratorLine} from './lobby-world.js';
import {secretHostCompletion} from './ai.js';

const SKILL_PATH=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../skills/secret-noir-host/SKILL.md');
const STAGES=new Set(['invitation','consent','place_question','place_reaction','actor_intro','actor_review','handoff']);
const ACTIONS={
  invitation:'accept_invitation',consent:'confirm_adult_consent',
  place_question:'submit_place',place_reaction:'open_casting',
  actor_intro:'upload_photos',actor_review:'review_casting',
  handoff:'begin_story'
};
const fallback={
 invitation:'Здравствуйте, уважаемый Гость. Завеса приоткрылась. Я — Незнакомец, Ваш проводник по театру образов. Позвольте пригласить Вас внутрь.',
 consent:'В этом театре каждый шаг остаётся Вашим выбором. Вы можете остановиться или отказаться от любого приглашения. Готовы продолжить?',
 place_question:'Закройте глаза и представьте место, где Вам хотелось бы оказаться. Представили? Теперь назовите его мне.',
 actor_intro:'А теперь выйдите на свет. Покажитесь. Одной, двух или трёх фотографий достаточно, чтобы подготовить Ваш актёрский образ.',
 actor_review:'Ваш образ ожидает Вашего взгляда. Откройте карточку: её можно подтвердить, перегенерировать по тем же снимкам или пересобрать с новыми.',
 handoff:'Замечательно. Теперь всё готово. Театр ждёт Вас, а имя Вашего партнёра ещё скрыто за завесой. Позвольте истории начаться.'
};
const fallbackText=(stage,place)=>stage==='place_reaction'
 ?buildLobbyNarratorLine({place})
 :fallback[stage]||fallback.invitation;

export async function buildSecretHostTurn({stage,place='',mood='тайна',actorReady=false,actorApproved=false}={}){
 if(!STAGES.has(stage))throw new Error('NOVEL2_HOST_STAGE_INVALID');
 if(stage==='handoff'&&!actorApproved)throw new Error('NOVEL2_HOST_ACTOR_APPROVAL_REQUIRED');
 if(stage==='actor_review'&&!actorReady)throw new Error('NOVEL2_HOST_ACTOR_NOT_READY');
 const cleanPlace=stage==='place_reaction'?normalizeGuestPlace(place):'';
 const cleanMood=['тайна','притяжение','приключение'].includes(mood)?mood:'тайна';
 const input={stage,place:cleanPlace,mood:cleanMood,actor_status:actorReady?'ready':'pending',
   actor_approved:actorApproved,
   allowed_next_action:ACTIONS[stage],
   facts:{fictional_presenter:true,partner_identity_hidden:true,audio_deferred:true}};
 return{input,fallback_line:fallbackText(stage,cleanPlace)};
}
let skillPromise;
async function loadSkill(){
 skillPromise??=fs.readFile(SKILL_PATH,'utf8');
 return skillPromise;
}
export async function secretHostTurn(args={}){
 const {input,fallback_line}=await buildSecretHostTurn(args);
 try{
  const modelReply=await secretHostCompletion({
    system:await loadSkill(),user:input,maxTokens:420,temperature:.72
  });
  const parsed=typeof modelReply==='string'?JSON.parse(modelReply):modelReply;
  const line=String(parsed?.line||'').trim().slice(0,320);
  if(!line||parsed?.stage!==input.stage||parsed?.next_action!==input.allowed_next_action)
    throw new Error('NOVEL2_HOST_CONTRACT_INVALID');
  return {stage:input.stage,line,scene_hint:String(parsed?.scene_hint||'').slice(0,180),
    next_action:input.allowed_next_action,provider:String(parsed?.provider||'ai'),fallback:false};
 }catch(error){
  // Cinematic onboarding is never prevented by a regional AI failure.
  console.warn('NOVEL2_SECRET_HOST_FALLBACK',{code:'HOST_AI_UNAVAILABLE'});
  return{stage:input.stage,line:fallback_line,scene_hint:'',
    next_action:input.allowed_next_action,provider:'script',fallback:true};
 }
}
