export const ROOM17_DEMO_ID='room17_demo_v1';
export const ROOM17_DEMO_VERSION=1;
export const ROOM17_PHYSICAL_SCENE_COUNT=3;

const LEVEL_RANK=Object.freeze({low:0,medium:1,high:2});
const arr=(v,max=12)=>Array.isArray(v)?v.slice(0,max):[];

export const ROOM17_STORY_BIBLE=Object.freeze({
  id:ROOM17_DEMO_ID,
  title:'Комната №17',
  dramatic_question:'Что находится за несуществующей дверью №17 и почему ключ оказался именно у этих двоих?',
  motifs:['серебряный ключ','номер 17','запечатанный конверт','коридор после полуночи'],
  echo_seed:'Не открывай эту дверь без меня.',
  reader_plan:{target_pages:14,min_pages:10,max_pages:20,prologue_counted:false,epilogue_counted:false,interaction_anchors:[{after_page:4,scene_id:'key'},{after_page:8,scene_id:'keeper'},{after_page:13,scene_id:'room17'}],media_ready:true},
  protagonists:[
    {id:'mark',name:'Марк',sex:'male',performed_by:'male_player',personality:'Собранный, наблюдательный, ироничный.',voice:'Короткие точные реплики.'},
    {id:'eva',name:'Ева',sex:'female',performed_by:'female_player',personality:'Любопытная, эмоционально точная, внимательная к подтексту.',voice:'Наблюдательные вопросы и реплики с двойным смыслом.'}
  ],
  supporting_characters:[
    {id:'viktor',name:'Виктор',sex:'male',performed_by:'male_player',personality:'Сдержанный, прямой, уважает ясную инициативу.',private_motive:'Проверить, способны ли герои дойти до комнаты №17 по собственной воле.',secret:'Он знает, что номер существовал, но был исключён из планов здания.',voice:'Небольшие фразы, встречные вопросы, паузы.'}
  ],
  finale:{reveal:'Комната №17 существует.',final_object:'Письмо с отсылкой к событиям прошлой зимы.',card:'Продолжение следует…'}
});

export const ROOM17_SCENES=Object.freeze([
  {
    index:0,id:'key',title:'Ключ',
    cast:{male_player:'mark',female_player:'eva',ai:[]},
    story_goal:'Связать серебряный ключ с отношениями героев и естественно ввести совместное действие.',
    level_labels:{
      male_player:[['low','Бережно'],['medium','Уверенно'],['high','Смело']],
      female_player:[['low','Бережно'],['medium','Уверенно'],['high','Смело']]
    },
    direct_clue:'mark_on_key',alternate_route:'clue_from_envelope',
    echo_line:'Не открывай эту дверь без меня.',next:'keeper'
  },
  {
    index:1,id:'keeper',title:'Хранитель',
    cast:{male_player:'viktor',female_player:'eva',ai:[]},
    absent_main_character:'mark',
    role_switch:{player:'male_player',from:'mark',to:'viktor',return_after_scene:true},
    story_goal:'Проверить смену роли, асимметрию знаний и возможность потерять прямую улику без поломки центральной линии.',
    level_labels:{
      male_player:[['low','Сдержанно'],['medium','Прямо'],['high','Жёстко']],
      female_player:[['low','Осторожно'],['medium','Уверенно'],['high','Напористо']]
    },
    character_gate:{character:'viktor',direct_clue_on:['high']},
    direct_clue:'archive_location',alternate_route:'photo_false_lead_then_west_wing',
    echo_line:'Некоторые двери открываются не ключом.',next:'room17'
  },
  {
    index:2,id:'room17',title:'Несуществующий номер',
    cast:{male_player:'mark',female_player:'eva',ai:[]},
    role_return:{player:'male_player',to:'mark'},
    story_goal:'Вернуть обоих главных героев в общую линию и окупить ключ и первую фразу.',
    level_labels:{
      male_player:[['low','Медленно'],['medium','Близко'],['high','Без колебаний']],
      female_player:[['low','Медленно'],['medium','Близко'],['high','Без колебаний']]
    },
    direct_clue:'room17_opened',alternate_route:'room17_opened_via_replanned_path',
    echo_line:'Не открывай эту дверь без меня.',final:true
  }
]);

export function room17Scene(index=0){
  return ROOM17_SCENES[Math.max(0,Math.min(ROOM17_SCENES.length-1,Number(index)||0))];
}
export function room17Character(id=''){
  return [...ROOM17_STORY_BIBLE.protagonists,...ROOM17_STORY_BIBLE.supporting_characters].find(x=>x.id===String(id))||null;
}
export function newRoom17Gate(sceneIndex=0){
  const scene=room17Scene(sceneIndex);
  return {version:1,demo_id:ROOM17_DEMO_ID,scene_index:scene.index,scene_id:scene.id,phase:'intent',intent:{male_player:null,female_player:null},intensity:{male_player:null,female_player:null,effective:null},preview:null,acceptance:{male_player:null,female_player:null},outcome:null};
}
export function mergeRoom17Intent(a,b){
  if(a==='decline'||b==='decline')return'decline';
  if(a==='interact'&&b==='interact')return'interact';
  return'pending';
}
export function mergeRoom17Intensity(a,b){
  if(!(a in LEVEL_RANK)||!(b in LEVEL_RANK))return null;
  const rank=Math.min(LEVEL_RANK[a],LEVEL_RANK[b]);
  return Object.keys(LEVEL_RANK).find(k=>LEVEL_RANK[k]===rank)||'low';
}
export function submitRoom17Intent(gate,actor,value){
  if(!['male_player','female_player'].includes(actor))throw new Error('ROOM17_ACTOR_INVALID');
  if(!['interact','decline'].includes(value))throw new Error('ROOM17_INTENT_INVALID');
  if(gate.phase!=='intent')throw new Error('ROOM17_INTENT_PHASE_INVALID');
  const next={...gate,intent:{...gate.intent,[actor]:value}};
  const merged=mergeRoom17Intent(next.intent.male_player,next.intent.female_player);
  if(merged==='decline')return {...next,phase:'replan',outcome:{kind:'declined_before_generation'}};
  if(merged==='interact')return {...next,phase:'intensity'};
  return next;
}
export function submitRoom17Intensity(gate,actor,value){
  if(!['male_player','female_player'].includes(actor))throw new Error('ROOM17_ACTOR_INVALID');
  if(!(value in LEVEL_RANK))throw new Error('ROOM17_INTENSITY_INVALID');
  if(gate.phase!=='intensity')throw new Error('ROOM17_INTENSITY_PHASE_INVALID');
  const intensity={...gate.intensity,[actor]:value};
  const effective=mergeRoom17Intensity(intensity.male_player,intensity.female_player);
  return {...gate,intensity:{...intensity,effective},phase:effective?'generating':'intensity'};
}
export function attachRoom17Preview(gate,preview){
  if(gate.phase!=='generating')throw new Error('ROOM17_PREVIEW_PHASE_INVALID');
  if(!preview||!String(preview.title||'').trim()||!String(preview.literary_text||'').trim())throw new Error('ROOM17_PREVIEW_INVALID');
  return {...gate,phase:'acceptance',preview,acceptance:{male_player:null,female_player:null}};
}
export function submitRoom17Acceptance(gate,actor,value){
  if(!['male_player','female_player'].includes(actor))throw new Error('ROOM17_ACTOR_INVALID');
  if(!['accept','decline'].includes(value))throw new Error('ROOM17_ACCEPTANCE_INVALID');
  if(gate.phase!=='acceptance')throw new Error('ROOM17_ACCEPTANCE_PHASE_INVALID');
  const acceptance={...gate.acceptance,[actor]:value};
  if(value==='decline')return {...gate,acceptance,phase:'replan',outcome:{kind:'scene_declined'}};
  if(acceptance.male_player==='accept'&&acceptance.female_player==='accept')return {...gate,acceptance,phase:'live'};
  return {...gate,acceptance};
}
export function resolveRoom17LiveScene(gate,result='completed'){
  if(gate.phase!=='live')throw new Error('ROOM17_LIVE_PHASE_INVALID');
  if(result==='stopped')return {...gate,phase:'replan',outcome:{kind:'stopped_during_scene'}};
  if(result!=='completed')throw new Error('ROOM17_LIVE_RESULT_INVALID');
  const scene=room17Scene(gate.scene_index);
  const direct=!scene.character_gate||arr(scene.character_gate.direct_clue_on,8).includes(gate.intensity.effective);
  return {...gate,phase:'resolved',outcome:{kind:'completed',clue:direct?scene.direct_clue:scene.alternate_route,direct,echo_line:scene.echo_line,next:scene.final?'feedback':scene.next}};
}
export function replanRoom17(gate){
  if(gate.phase!=='replan')throw new Error('ROOM17_REPLAN_PHASE_INVALID');
  const scene=room17Scene(gate.scene_index);
  return {...gate,phase:'resolved',outcome:{...(gate.outcome||{}),kind:'replanned',clue:scene.alternate_route,direct:false,echo_line:null,next:scene.final?'feedback':scene.next}};
}
export function room17RoleBriefs(sceneIndex=0){
  const scene=room17Scene(sceneIndex),male=room17Character(scene.cast.male_player),female=room17Character(scene.cast.female_player);
  return {male_player:male,female_player:female};
}
