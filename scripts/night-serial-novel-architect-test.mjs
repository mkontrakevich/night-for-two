import assert from 'node:assert/strict';
import {generateSerialNovelPlan,novelSceneContext,validateSerialNovelPlan} from '../src/night-serial-novel-architect.js';

const chars=[
  {id:'hero_m',name:'Марк',sex:'male',public_identity:'Архитектор',private_motive:'Узнать правду',desire:'Доверие',fear:'Потерять контроль',contradiction:'Рационален, но импульсивен',secret:'Скрывает найденное письмо',leverage:'Знает план здания',relationship_to_protagonists:'Главный герой',arc_start:'Закрыт',arc_turn:'Рискует доверием',arc_end:'Делится правдой',first_appearance:1,planned_reveal:'Письмо связано с финалом'},
  {id:'hero_f',name:'Ева',sex:'female',public_identity:'Куратор',private_motive:'Раскрыть тайну дома',desire:'Близость и свобода',fear:'Быть использованной',contradiction:'Смела, но осторожна',secret:'Знает символ на ключе',leverage:'Имеет доступ к архиву',relationship_to_protagonists:'Главная героиня',arc_start:'Осторожна',arc_turn:'Берёт инициативу',arc_end:'Доверяет выбору пары',first_appearance:1,planned_reveal:'Символ открывает последнюю комнату'}
];
const supporting=[
  {id:'m1',name:'Адриан',sex:'male',private_motive:'Скрыть прошлое',secret:'Подменил запись'},
  {id:'f1',name:'Лора',sex:'female',private_motive:'Вернуть письмо',secret:'Знает код'},
  {id:'m2',name:'Виктор',sex:'male',private_motive:'Защитить архив',secret:'Следит за домом'},
  {id:'f2',name:'Мира',sex:'female',private_motive:'Разоблачить Адриана',secret:'Хранит вторую часть карты'}
];
const raw={
  novel_id_seed:'seed',
  title:'Дом после полуночи',
  logline:'Двое героев возвращаются в закрытый особняк и обнаруживают историю, которая меняет их отношения.',
  controlling_idea:'Доверие становится близостью, когда тайна перестаёт быть оружием.',
  dramatic_question:'Смогут ли герои раскрыть тайну дома, не разрушив доверие?',
  genre_mix:['erotic romance','mystery'],
  erotic_promise:'Интрига и близость растут вместе.',
  world_bible:{time:'сейчас',place:'старый загородный дом',social_environment:'закрытый круг владельцев',recurring_locations:['архив','зимний сад'],institutions:['фонд'],rules:['после полуночи закрывается западное крыло'],traditions:['ужин при свечах'],secrets:['исчезнувшая запись'],objects:['серебряный ключ'],motifs:['зеркала'],sensual_visual_language:'тёплый свет, стекло, тени'},
  protagonists:chars,
  supporting_characters:supporting,
  master_plot:Array.from({length:8},(_,i)=>({key:'beat_'+(i+1),title:'Beat '+(i+1),function:'Драматическая функция '+(i+1),episode:Math.min(6,i+1),threads:['main'],setup_ids:[],payoff_ids:[]})),
  episodes:Array.from({length:6},(_,i)=>({title:'Серия '+(i+1),dramatic_function:'Функция серии '+(i+1),opening_state:'Состояние '+(i+1),main_thread:'main',side_threads:i%2?['secret_a']:['secret_b'],clue_ids:[],role_cards:[{character_id:'hero_m',performed_by:'male_player'},{character_id:'hero_f',performed_by:'female_player'}],major_turn:'Поворот '+(i+1),erotic_function:'Рост напряжения '+(i+1),ending_hook:'Крючок '+(i+1)})),
  thread_graph:[
    {thread_id:'main',kind:'main',title:'Главная линия',promise:'Тайна дома и отношения',trigger:'Возвращение',current_question:'Что скрывает дом?',clues:['ключ'],false_leads:[],escalation_beats:['письмо'],reveal:'Истина',payoff:'Финальный выбор',links:['secret_a'],eligible_for_spinoff:false,return_to_main:'всегда'},
    {thread_id:'mystery',kind:'mystery',title:'Архив',promise:'Расследование',trigger:'Запись',current_question:'Кто подменил запись?',clues:['печать'],false_leads:['ложная дата'],escalation_beats:['архив'],reveal:'Адриан',payoff:'Признание',links:['main'],eligible_for_spinoff:true,return_to_main:'после признания'},
    {thread_id:'secret_a',kind:'secondary',title:'Линия Лоры',promise:'Мотив Лоры',trigger:'Письмо',current_question:'Зачем ей письмо?',clues:['инициалы'],false_leads:[],escalation_beats:['встреча'],reveal:'Она защищает Еву',payoff:'Передаёт код',links:['main'],eligible_for_spinoff:true,return_to_main:'код найден'},
    {thread_id:'secret_b',kind:'secondary',title:'Линия Виктора',promise:'Наблюдатель',trigger:'Следы',current_question:'Кого он защищает?',clues:['фонарь'],false_leads:[],escalation_beats:['слежка'],reveal:'Архив',payoff:'Открывает проход',links:['main'],eligible_for_spinoff:true,return_to_main:'проход открыт'}
  ],
  plant_payoff_ledger:Array.from({length:8},(_,i)=>({setup_id:'setup_'+(i+1),planted_in:Math.min(6,i+1),visible_detail:'Деталь '+(i+1),hidden_meaning:'Смысл '+(i+1),possible_interpretations:['A','B'],payoff_episode:Math.min(6,Math.max(2,i+1)),payoff_type:i%2?'mystery':'reveal'})),
  finale_contract:{crisis:'Герои решают, кому доверять',climax:'Открывают последнюю комнату',central_resolution:'Тайна раскрыта, отношения меняются',final_image:'Тот же ключ лежит на открытой ладони',must_payoff:['setup_1','setup_2']},
  sequel_hooks:['Нераскрытая подпись в архиве'],
  style_bible:{voice:'кинематографично',pacing:'нарастающее',dialogue:'с подтекстом',visual_language:'тёплые тени',forbidden_patterns:['случайные сцены']}
};

const plan=validateSerialNovelPlan(raw,{bookSeed:'book-seed'});
assert.equal(plan.book_seed,'book-seed');
assert.equal(plan.protagonists.length,2);
assert.equal(plan.protagonists.find(x=>x.sex==='male').performed_by,'male_player');
assert.equal(plan.protagonists.find(x=>x.sex==='female').performed_by,'female_player');
assert(plan.supporting_characters.filter(x=>x.performed_by==='male_player').length>=2);
assert(plan.supporting_characters.filter(x=>x.performed_by==='female_player').length>=2);
assert(plan.thread_graph.filter(x=>x.eligible_for_spinoff).length>=2);
assert.equal(plan.episodes.length,6);
const russianSexPlan=validateSerialNovelPlan({...raw,protagonists:[
  {...chars[0],sex:'мужчина'},
  {...chars[1],sex:'женщина'}
]},{bookSeed:'ru-sex'});
assert.equal(russianSexPlan.protagonists.find(x=>x.sex==='male')?.performed_by,'male_player');
assert.equal(russianSexPlan.protagonists.find(x=>x.sex==='female')?.performed_by,'female_player');
const alternateProtagonistsPlan=validateSerialNovelPlan({...raw,protagonists:undefined,main_characters:[
  {...chars[0],sex:'male'},
  {...chars[1],sex:'female'}
]},{bookSeed:'alternate-protagonists'});
assert.equal(alternateProtagonistsPlan.protagonists.length,2);
assert.equal(alternateProtagonistsPlan.protagonists[0].sex,'male');
assert.equal(alternateProtagonistsPlan.protagonists[1].sex,'female');



const ctx=novelSceneContext(plan,{episode_index:1,current_roles:{male_player:'m1',female_player:'f1'},canon:{key_found:true}});
assert.equal(ctx.episode.episode,2);
assert.equal(ctx.current_roles.male_player,'m1');
assert(ctx.active_threads.length>=1);

const generated=await generateSerialNovelPlan({bookSeed:'unique-1',relationshipProfile:{},mutualWishes:[],generate:async req=>{
  const body=JSON.parse(req.messages[1].content);
  assert.equal(body.bookSeed,'unique-1');
  return JSON.stringify({...raw,novel_id_seed:'unique-1'});
}});
assert.equal(generated.book_seed,'unique-1');
assert.equal(generated.master_plot.length,8);

console.log('NIGHT_SERIAL_NOVEL_ARCHITECT_OK plan=true roles=true threads=true spinoff=true');
