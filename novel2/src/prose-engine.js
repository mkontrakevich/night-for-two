import {jsonCompletion} from './ai.js';

const PROSE_SYSTEM = `
Ты — литературный движок оригинального интерактивного романа для двух совершеннолетних игроков.

Это не квест с кнопками и не набор эротических заданий. Это цельный роман, где каждый игрок играет своего героя и отвечает за него собственными словами.

ЛИТЕРАТУРНЫЙ РЕЖИМ
— современная коммерческая dark erotic romance беллетристика;
— близкая психологическая камера;
— чувственность через поведение, паузы, власть, дистанцию, взгляд, голос, ткань, запах, температуру, предметы и внутреннюю реакцию;
— жёсткая взрослая энергетика допустима, но избегай механического анатомического перечисления и порнографической инструкции;
— эротический смысл должен быть понятен из контекста, даже когда он не назван прямо;
— диалог короткий, характерный, с подтекстом;
— действие всегда важнее абстрактных описаний эмоций;
— оригинальная проза: не копируй и не имитируй конкретного автора, книгу, персонажей или узнаваемые фразы.

GAMEPLAY
— это прежде всего РОМАН, а не частый обмен короткими ходами;
— между решениями игрока должен идти полноценный литературный фрагмент: ориентир 900–1500 слов, 8–14 абзацев и минимум 3 самостоятельных драматургических бита;
— не останавливай сцену после каждой реплики. Второстепенные персонажи и AI-герой могут говорить, двигаться, менять ситуацию и развивать конфликт без немедленного возврата управления игроку;
— перед новым primary_interaction сцена должна продвинуть хотя бы два из четырёх слоёв: сюжет, отношения, тайну/ставку, физическую ситуацию;
— решение игрока запрашивается только в точке, где его ответ действительно меняет ход сцены, отношения, риск или направление сюжета;
— после каждой сцены один конкретный герой получает естественный повод ответить или действовать;
— primary_interaction.type почти всегда "free_reply";
— prompt — реплика, вопрос или ситуация внутри сцены;
— игрок отвечает от лица персонажа свободным текстом;
— optional_actions допускаются только когда есть реальное физическое/сюжетное решение, максимум 3;
— следующая сцена обязана реализовать смысл пользовательского ответа, а не игнорировать его;
— пользовательская реплика становится каноном;
— никогда не подменяй ответ пользователя заранее написанной репликой.

DRAMA
У романа должны быть цель, конфликт, поворот, тайна/ставка, развитие отношений и финал. Эротика усиливает драму, а не заменяет её.

Верни только JSON.
`;

function cleanVisualScene(value={},fallbackBeat='') {
  const v=value&&typeof value==='object'?value:{};
  const present=(Array.isArray(v.characters_present)?v.characters_present:[])
    .map(x=>String(x||'').toUpperCase())
    .filter((x,i,a)=>['A','B'].includes(x)&&a.indexOf(x)===i)
    .slice(0,2);
  return {
    location:String(v.location||'').trim().slice(0,900),
    location_details:String(v.location_details||'').trim().slice(0,1400),
    characters_present:present,
    blocking:String(v.blocking||'').trim().slice(0,1200),
    wardrobe:String(v.wardrobe||'').trim().slice(0,1000),
    props:String(v.props||'').trim().slice(0,1000),
    time_light:String(v.time_light||'').trim().slice(0,800),
    camera_moment:String(v.camera_moment||fallbackBeat||'').trim().slice(0,1200)
  };
}

function cleanScene(value={}) {
  const s=value&&typeof value==='object'?value:{};
  const visualBeat=String(s.visual_beat||'').trim().slice(0,1200);
  return {
    chapter_no:Math.max(1,Number(s.chapter_no)||1),
    chapter_title:String(s.chapter_title||'').slice(0,100),
    prose:String(s.prose||'').trim().slice(0,18000),
    target_role:['A','B'].includes(String(s.target_role))?String(s.target_role):'A',
    primary_interaction:{
      type:'free_reply',
      prompt:String(s.primary_interaction?.prompt||'Что вы отвечаете?').trim().slice(0,500)
    },
    optional_actions:(Array.isArray(s.optional_actions)?s.optional_actions:[]).slice(0,3).map(x=>({
      key:String(x?.key||'').slice(0,40),
      label:String(x?.label||'').slice(0,120)
    })).filter(x=>x.key&&x.label),
    visual_beat:visualBeat,
    visual_scene:cleanVisualScene(s.visual_scene||{},visualBeat),
    continuity_updates:s.continuity_updates&&typeof s.continuity_updates==='object'?s.continuity_updates:{},
    hook:String(s.hook||'').trim().slice(0,500)
  };
}

const LONG_SCENE_MIN_CHARS=4200;
const LONG_SCENE_TARGET='5500–9500 знаков, обычно 900–1500 слов';

async function ensureLongScene(scene,{storyBible={},recentTurns=[],reason=''}={}){
  if(scene.prose.length>=LONG_SCENE_MIN_CHARS)return scene;
  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.74,
    maxTokens:5600,
    user:{
      task:'Расширь уже написанную сцену до полноценного фрагмента романа. Не добавляй нового решения игрока раньше финала и не меняй смысл уже заданной точки выбора.',
      length_target:LONG_SCENE_TARGET,
      short_scene:scene,
      story_bible:storyBible,
      recent_turns:recentTurns,
      reason,
      output:{
        scene:{
          chapter_no:scene.chapter_no,
          chapter_title:scene.chapter_title,
          prose:'',
          target_role:scene.target_role,
          primary_interaction:scene.primary_interaction,
          optional_actions:scene.optional_actions,
          visual_beat:scene.visual_beat,
          visual_scene:scene.visual_scene,
          continuity_updates:scene.continuity_updates,
          hook:scene.hook
        }
      },
      hard_rules:[
        'Сохрани тот же target_role и ту же финальную точку взаимодействия.',
        'Не пиши за героя, которым должен управлять пользователь, его решающую реплику или выбор.',
        'Добавь 3–5 последовательных драматургических битов до точки решения.',
        'Развивай локацию, предметную среду, действия, характерный диалог, внутреннее напряжение и причинность.',
        'Не заполняй объём повторением эмоций, одинаковыми взглядами, паузами и абстрактным напряжением.',
        'Сцена должна читаться как часть романа, а не как удлинённый игровой prompt.',
        'visual_scene обнови так, чтобы он соответствовал итоговой расширенной сцене.'
      ]
    }
  });
  const expanded=cleanScene(data.scene||{});
  return expanded.prose.length>=scene.prose.length?expanded:scene;
}

export async function createStoryBible({characters={},relationshipContext={}}={}) {
  const A=characters.A&&typeof characters.A==='object'?characters.A:null;
  const B=characters.B&&typeof characters.B==='object'?characters.B:null;
  if(!A?.passport||!B?.passport) throw new Error('NOVEL2_CHARACTER_CARDS_REQUIRED');

  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.88,
    maxTokens:7000,
    user:{
      task:'Создай скрытую архитектуру нового романа и первую сцену вокруг двух уже созданных пользовательских персонажей. Их карточки — канон героев, а не черновик.',
      player_characters:{A,B},
      sanitized_pair_dynamics:{
        raw_messages:false,
        observations:Array.isArray(relationshipContext?.observations)?relationshipContext.observations.slice(0,18):[],
        preferences:Array.isArray(relationshipContext?.preferences)?relationshipContext.preferences.slice(0,12):[],
        dynamics:Array.isArray(relationshipContext?.dynamics)?relationshipContext.dynamics.slice(0,10):[]
      },
      character_contract:[
        'Сохраняй fiction_name, возраст 21+, речевую манеру, внутреннее противоречие и заявленную сюжетную роль каждого героя.',
        'Не меняй внешность, биографию и устойчивые черты героя без сюжетно объяснённого события.',
        'visual_dna используется как источник для visual_beat, но не вставляется в прозу техническим языком.',
        'Психология в character card является художественной характеристикой персонажа, а не диагнозом реального человека.',
        'Роман должен столкнуть особенности A и B так, чтобы их характеры реально влияли на конфликт и притяжение.',
        'Sanitized pair dynamics можно использовать для узнаваемого ритма общения, инициативы, поддержки и планирования, но нельзя цитировать, реконструировать или выдавать исходные сообщения.',
        'Не выводи из общения интимные предпочтения, сексуальные границы, диагнозы, религию, политику и другие чувствительные характеристики.'
      ],
      output:{
        title:'',
        logline:'',
        controlling_idea:'',
        world_bible:{},
        protagonists:{
          A:{fiction_name:A.passport?.fiction_name||'',role:A.passport?.story_role||'',public_goal:A.psychology?.public_goal||'',private_need:A.psychology?.hidden_need||'',fear:'',contradiction:A.psychology?.contradiction||'',voice:A.psychology?.speech_style||''},
          B:{fiction_name:B.passport?.fiction_name||'',role:B.passport?.story_role||'',public_goal:B.psychology?.public_goal||'',private_need:B.psychology?.hidden_need||'',fear:'',contradiction:B.psychology?.contradiction||'',voice:B.psychology?.speech_style||''}
        },
        player_characters:{A,B},
        master_plot:[],
        threads:[],
        canon:{},
        first_scene:{
          chapter_no:1,chapter_title:'',prose:'',target_role:'A',
          primary_interaction:{type:'free_reply',prompt:''},
          optional_actions:[],
          visual_beat:'',
          visual_scene:{
            location:'',
            location_details:'',
            characters_present:['A','B'],
            blocking:'',
            wardrobe:'',
            props:'',
            time_light:'',
            camera_moment:''
          },
          continuity_updates:{},
          hook:''
        }
      },
      rules:[
        'Оба главных героя совершеннолетние и уже определены карточками.',
        'Начни с конкретной ситуации, а не с анкеты или знакомства с интерфейсом.',
        'Не объясняй устройство игры внутри прозы.',
        'Первая сцена должна проявить хотя бы по одной уникальной черте каждого персонажа.',
        'Первая сцена должна быть полноценным литературным эпизодом: ориентир 5500–9500 знаков, 8–14 абзацев, 3–5 драматургических битов до первого решения игрока.',
        'Не прерывай сцену ради решения после одной-двух реплик. Сначала дай событию, локации, отношениям и конфликту реально развиться.',
        'Первая сцена должна закончиться прямой репликой или обстоятельством, на которое один игрок должен ответить.',
        'visual_scene обязательно описывает фактическую локацию сцены, присутствующих героев, их положение, одежду, значимые предметы и свет. Это технический канон для иллюстрации, а не декоративный mood prompt.',
        'characters_present содержит только A/B, которые физически находятся в кадре текущей сцены.'
      ]
    }
  });
  let first=cleanScene(data.first_scene||{});
  if(!data.title||first.prose.length<500) throw new Error('NOVEL2_BIBLE_INVALID');
  first=await ensureLongScene(first,{storyBible:{...data,player_characters:{A,B}},reason:'first_scene'});
  if(first.prose.length<2500) throw new Error('NOVEL2_BIBLE_TOO_SHORT');
  return {...data,player_characters:{A,B},first_scene:first};
}

export async function continueStory({book, recentTurns, playerRole, playerReply, actionKey=''}) {
  const bible=book.story_bible||{},canon=book.canon||{};
  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.82,
    maxTokens:5200,
    user:{
      task:'Продолжи роман после свободного ответа игрока. Ответ игрока — каноническое действие его героя. Напиши полноценный длинный литературный эпизод до следующего действительно значимого решения.',
      story_bible:bible,
      canon,
      current_scene:book.current_scene||{},
      recent_turns:recentTurns,
      player_input:{role:playerRole,reply:String(playerReply||'').slice(0,3000),action_key:String(actionKey||'')},
      output:{
        scene:{
          chapter_no:Number(book.chapter_no)||1,
          chapter_title:'',
          prose:'',
          target_role:playerRole==='A'?'B':'A',
          primary_interaction:{type:'free_reply',prompt:''},
          optional_actions:[],
          visual_beat:'',
          visual_scene:{
            location:'',
            location_details:'',
            characters_present:['A','B'],
            blocking:'',
            wardrobe:'',
            props:'',
            time_light:'',
            camera_moment:''
          },
          continuity_updates:{},
          hook:''
        },
        canon:{}
      },
      hard_rules:[
        'Покажи последствия именно того, что написал игрок.',
        'Между этим ответом и следующим решением дай ориентировочно 5500–9500 знаков прозы, 8–14 абзацев и 3–5 драматургических битов.',
        'Не возвращай управление игроку после каждой короткой реплики: персонажи вокруг него должны успеть ответить, действовать, изменить обстановку и продвинуть конфликт.',
        'Не повторяй его фразу дословно без необходимости.',
        'Не обнуляй конфликт и не делай универсальную романтическую паузу.',
        'Сохраняй имена, роли, знания персонажей, предметы, место и причинность.',
        'Сверяй действия и реплики с player_characters из story_bible: характеры должны влиять на продолжение, а не быть декоративной анкетой.',
        'Следующий активный герой обычно другой игрок, если драматургически нет веской причины оставить ход текущему.',
        'visual_scene должен строго соответствовать только что написанной сцене: та же локация, те же физически присутствующие герои, их одежда, позы, реквизит и время/свет.',
        'Не помещай героя в characters_present, если по прозе его физически нет в этой локации.'
      ]
    }
  });
  let scene=cleanScene(data.scene||{});
  if(scene.prose.length<350) throw new Error('NOVEL2_SCENE_INVALID');
  scene=await ensureLongScene(scene,{storyBible:bible,recentTurns,reason:'between_player_decisions'});
  if(scene.prose.length<2500) throw new Error('NOVEL2_SCENE_TOO_SHORT');
  return {scene,canon:data.canon&&typeof data.canon==='object'?data.canon:canon};
}


export async function generateAiCharacterReply({book,recentTurns,role,characterCard}) {
  if(!['A','B'].includes(role)) throw new Error('NOVEL2_AI_ROLE_INVALID');
  const scene=book?.current_scene||{};
  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.82,
    maxTokens:1800,
    user:{
      task:'Сыграй один ход за AI-персонажа автоматически. Дай естественную реплику и при необходимости короткое физическое действие этого героя, без продолжения сцены. Пользователь не должен писать реплики за AI-персонажа.',
      player_role:role,
      character_card:characterCard||{},
      story_bible:book?.story_bible||{},
      current_scene:scene,
      recent_turns:recentTurns||[],
      interaction_prompt:scene?.primary_interaction?.prompt||'',
      output:{reply:'',action_key:''},
      hard_rules:[
        'Пиши от лица и характера только этого героя.',
        'Не управляй вторым главным героем.',
        'Не пересказывай всю сцену.',
        'Ответ должен быть достаточно содержательным, чтобы prose engine мог построить последствия.',
        'Сохраняй заявленную манеру речи, внутреннее противоречие и границы персонажа.',
        'Не превращай ответ в меню вариантов.',
        'Реплика должна звучать как самостоятельный ответ живого персонажа на текущую ситуацию, а не как служебный текст или пересказ prompt.'
      ]
    }
  });
  const reply=String(data?.reply||'').trim().slice(0,3000);
  if(!reply) throw new Error('NOVEL2_AI_REPLY_EMPTY');
  return {reply,actionKey:String(data?.action_key||'').trim().slice(0,80)};
}
