import {NIGHT_V2_PACKS,NIGHT_V2_COUPONS,nightV2Pack} from './night-for-two-v2-catalog.js';

export const NIGHT_V2_LEVELS=Object.freeze({tender:0,bold:1,hot:2});
export const NIGHT_V2_FEEDBACK=new Set(['down','same','up']);
export const NIGHT_V2_PERMISSIONS=new Set(['words','embrace','kiss','touch','massage','closer']);
export const NIGHT_V2_MATCH_CHOICES=new Set(['yes','maybe','no']);
export const NIGHT_V2_PHASES=Object.freeze(['match','challenge','feedback','complete']);
export const NIGHT_V2_INTIMATE_PERMISSIONS=new Set(['kiss','touch','massage','closer']);
export const NIGHT_V2_NIGHT_PACKS=new Set(['tender','sex_basics','acrobatics','super_acrobatics','home_fun','fetish_explore','new_sensations','naughty']);

function levelValue(value){return NIGHT_V2_LEVELS[value]??0;}
function normalizePermissions(values=[]){return [...new Set((Array.isArray(values)?values:[]).filter(v=>NIGHT_V2_PERMISSIONS.has(v)))];}
function isSubset(required=[],available=[]){const set=new Set(available);return required.every(item=>set.has(item));}
function maxHeatForLevel(level=0){return [2,3,5][Math.max(0,Math.min(2,Number(level)||0))];}
function intimateTask(task={}){const required=Array.isArray(task.requires)?task.requires:[];return Number(task.heat||0)>=2&&required.some(item=>NIGHT_V2_INTIMATE_PERMISSIONS.has(item));}
function taskWeight(task={}){const required=new Set(Array.isArray(task.requires)?task.requires:[]);let weight=Number(task.heat||0)*10;if(required.has('kiss'))weight+=1;if(required.has('touch'))weight+=2;if(required.has('massage'))weight+=3;if(required.has('closer'))weight+=5;return weight;}
function eligibleNightTasks(pack,{maxHeat,allowed,used=null}={}){if(!pack||!NIGHT_V2_NIGHT_PACKS.has(pack.key))return[];return pack.tasks.filter(task=>task.heat<=maxHeat&&intimateTask(task)&&isSubset(task.requires||[],allowed)&&(!used||!used.has(task.key)));}

export function negotiateNightV2(a={},b={}){
  const aLevel=levelValue(a.level),bLevel=levelValue(b.level),ceiling=Math.min(aLevel,bLevel);
  const aPermissions=normalizePermissions(a.permissions),bPermissions=normalizePermissions(b.permissions),bSet=new Set(bPermissions);
  const permissions=aPermissions.filter(item=>bSet.has(item));
  return {ceiling,level:Object.keys(NIGHT_V2_LEVELS).find(key=>NIGHT_V2_LEVELS[key]===ceiling)||'tender',permissions};
}

export function resolveNightV2Match(a='no',b='no'){
  const aa=NIGHT_V2_MATCH_CHOICES.has(a)?a:'no',bb=NIGHT_V2_MATCH_CHOICES.has(b)?b:'no';
  if(aa==='no'||bb==='no')return 'no';
  if(aa==='yes'&&bb==='yes')return 'yes';
  return 'maybe';
}

export function adjustNightV2Intensity({current=0,ceiling=0,a='same',b='same'}={}){
  const fa=NIGHT_V2_FEEDBACK.has(a)?a:'same',fb=NIGHT_V2_FEEDBACK.has(b)?b:'same';
  if(fa==='down'||fb==='down')return Math.max(0,current-1);
  if(fa==='up'&&fb==='up')return Math.min(ceiling,current+1);
  return Math.min(ceiling,Math.max(0,current));
}

export function leaderForRound(index=0){return Number(index)%2===0?'a':'b';}
export function roundPhase(status='matching'){
  if(status==='matching')return'match';
  if(status==='active')return'challenge';
  if(status==='feedback')return'feedback';
  return'complete';
}

export function availableNightV2Packs({level=0,permissions=[]}={}){
  const maxHeat=maxHeatForLevel(level),allowed=normalizePermissions(permissions);
  return NIGHT_V2_PACKS.filter(pack=>NIGHT_V2_NIGHT_PACKS.has(pack.key)).map(pack=>{
    const available=eligibleNightTasks(pack,{maxHeat,allowed});
    return {...pack,availableCount:available.length,tasks:undefined};
  }).filter(pack=>pack.availableCount>0);
}

export function chooseNightV2Round({packKey='tender',roundIndex=0,level=0,permissions=[],usedKeys=[]}={}){
  const pack=nightV2Pack(packKey)||nightV2Pack('tender');
  if(!pack||!NIGHT_V2_NIGHT_PACKS.has(pack.key))return null;
  const allowed=normalizePermissions(permissions),used=new Set(usedKeys),maxHeat=maxHeatForLevel(level);
  let eligible=eligibleNightTasks(pack,{maxHeat,allowed,used});
  if(!eligible.length)eligible=eligibleNightTasks(pack,{maxHeat,allowed});
  if(!eligible.length)return null;
  eligible=[...eligible].sort((a,b)=>taskWeight(a)-taskWeight(b)||String(a.key).localeCompare(String(b.key)));
  const stage=Math.max(0,Math.min(2,Number(roundIndex)||0));
  const target=Math.round((stage/2)*Math.max(0,eligible.length-1));
  const task=eligible[target]||eligible[0]||null;
  if(!task)return null;
  const leader=leaderForRound(roundIndex);
  const cue=stage===0?'Начните спокойно. Любой из вас может изменить темп, задание или остановиться.':stage===1?'Не спешите. Оставляйте только то, что сейчас нравится обоим.':'Это финальная сцена приложения. После неё телефон лучше убрать и продолжить самим только в комфортном для обоих темпе.';
  const leadCard={title:task.title,text:task.text,cue};
  const responseCard={title:task.title,text:task.text,cue};
  return {
    key:task.key,
    packKey:pack.key,
    packTitle:pack.title,
    heat:task.heat,
    leader,
    shared_task:{title:task.title,text:task.text},
    role_a:leader==='a'?leadCard:responseCard,
    role_b:leader==='b'?leadCard:responseCard,
    requires:task.requires||[]
  };
}

export function resolveNightV2FinalChoice(a='finish',b='finish'){
  const rank={finish:0,continue_without_phone:1,another_round:2};
  const safeA=Object.hasOwn(rank,a)?a:'finish',safeB=Object.hasOwn(rank,b)?b:'finish';
  return rank[safeA]<=rank[safeB]?safeA:safeB;
}

export function publicNightV2State(state={}){
  return {
    version:2,
    packKey:String(state.packKey||'tender'),
    roundIndex:Number(state.roundIndex||0),
    phase:roundPhase(state.status||'matching'),
    intensity:Number(state.intensity||0),
    ceiling:Number(state.ceiling||0),
    status:String(state.status||'matching'),
    leader:leaderForRound(state.roundIndex||0)
  };
}

export function nightV2CatalogSummary(){
  return {
    packs:NIGHT_V2_PACKS.map(pack=>({key:pack.key,title:pack.title,heat:pack.heat,length:pack.length,description:pack.description,taskCount:pack.tasks.length})),
    coupons:NIGHT_V2_COUPONS.map(item=>({key:item.key,title:item.title,heat:item.heat}))
  };
}
