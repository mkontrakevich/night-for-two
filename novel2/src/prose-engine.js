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

function cleanScene(value={}) {
  const s=value&&typeof value==='object'?value:{};
  return {
    chapter_no:Math.max(1,Number(s.chapter_no)||1),
    chapter_title:String(s.chapter_title||'').slice(0,100),
    prose:String(s.prose||'').trim().slice(0,12000),
    target_role:['A','B'].includes(String(s.target_role))?String(s.target_role):'A',
    primary_interaction:{
      type:'free_reply',
      prompt:String(s.primary_interaction?.prompt||'Что вы отвечаете?').trim().slice(0,500)
    },
    optional_actions:(Array.isArray(s.optional_actions)?s.optional_actions:[]).slice(0,3).map(x=>({
      key:String(x?.key||'').slice(0,40),
      label:String(x?.label||'').slice(0,120)
    })).filter(x=>x.key&&x.label),
    visual_beat:String(s.visual_beat||'').trim().slice(0,1200),
    continuity_updates:s.continuity_updates&&typeof s.continuity_updates==='object'?s.continuity_updates:{},
    hook:String(s.hook||'').trim().slice(0,500)
  };
}

export async function createStoryBible({characters={}}={}) {
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
      character_contract:[
        'Сохраняй fiction_name, возраст 21+, речевую манеру, внутреннее противоречие и заявленную сюжетную роль каждого героя.',
        'Не меняй внешность, биографию и устойчивые черты героя без сюжетно объяснённого события.',
        'visual_dna используется как источник для visual_beat, но не вставляется в прозу техническим языком.',
        'Психология в character card является художественной характеристикой персонажа, а не диагнозом реального человека.',
        'Роман должен столкнуть особенности A и B так, чтобы их характеры реально влияли на конфликт и притяжение.'
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
          continuity_updates:{},
          hook:''
        }
      },
      rules:[
        'Оба главных героя совершеннолетние и уже определены карточками.',
        'Начни с конкретной ситуации, а не с анкеты или знакомства с интерфейсом.',
        'Не объясняй устройство игры внутри прозы.',
        'Первая сцена должна проявить хотя бы по одной уникальной черте каждого персонажа.',
        'Первая сцена должна закончиться прямой репликой или обстоятельством, на которое один игрок должен ответить.'
      ]
    }
  });
  const first=cleanScene(data.first_scene||{});
  if(!data.title||first.prose.length<500) throw new Error('NOVEL2_BIBLE_INVALID');
  return {...data,player_characters:{A,B},first_scene:first};
}

export async function continueStory({book, recentTurns, playerRole, playerReply, actionKey=''}) {
  const bible=book.story_bible||{},canon=book.canon||{};
  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.82,
    maxTokens:5200,
    user:{
      task:'Продолжи роман после свободного ответа игрока. Ответ игрока — каноническое действие его героя.',
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
          continuity_updates:{},
          hook:''
        },
        canon:{}
      },
      hard_rules:[
        'Покажи последствия именно того, что написал игрок.',
        'Не повторяй его фразу дословно без необходимости.',
        'Не обнуляй конфликт и не делай универсальную романтическую паузу.',
        'Сохраняй имена, роли, знания персонажей, предметы, место и причинность.',
        'Сверяй действия и реплики с player_characters из story_bible: характеры должны влиять на продолжение, а не быть декоративной анкетой.',
        'Следующий активный герой обычно другой игрок, если драматургически нет веской причины оставить ход текущему.'
      ]
    }
  });
  const scene=cleanScene(data.scene||{});
  if(scene.prose.length<350) throw new Error('NOVEL2_SCENE_INVALID');
  return {scene,canon:data.canon&&typeof data.canon==='object'?data.canon:canon};
}
