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
    .map(x=>String(x||'').trim())
    .filter((x,i,a)=>/^[A-Za-z0-9_-]{1,60}$/.test(x)&&a.indexOf(x)===i)
    .slice(0,8);
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

function normalizeStoryBlueprint(raw={}) {
  const source=raw&&typeof raw==='object'?raw:{};
  let slots=(Array.isArray(source.cast_slots)?source.cast_slots:[]).slice(0,6).map((slot,index)=>({
    slot_key:String(slot?.slot_key||`role_${index+1}`).trim().replace(/[^A-Za-z0-9_-]/g,'_').slice(0,60),
    narrative_function:String(slot?.narrative_function||'').trim().slice(0,500),
    description:String(slot?.description||'').trim().slice(0,900),
    interactive:Boolean(slot?.interactive),
    required:slot?.required!==false,
    desired_traits:(Array.isArray(slot?.desired_traits)?slot.desired_traits:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,8)
  })).filter(x=>x.slot_key);
  if(slots.length<3){
    slots=[
      {slot_key:'lead_1',narrative_function:'первый интерактивный герой',description:'один из двух героев, чьи решения меняют сюжет',interactive:true,required:true,desired_traits:[]},
      {slot_key:'lead_2',narrative_function:'второй интерактивный герой',description:'второй герой с собственной линией решений',interactive:true,required:true,desired_traits:[]},
      {slot_key:'support_1',narrative_function:'ключевой AI-персонаж',description:'персонаж, который меняет ставки и направление истории',interactive:false,required:true,desired_traits:[]}
    ];
  }
  const interactive=slots.filter(x=>x.interactive);
  if(interactive.length!==2){
    slots=slots.map((x,i)=>({...x,interactive:i<2}));
  }
  return {
    title:String(source.title||'').trim().slice(0,140),
    logline:String(source.logline||'').trim().slice(0,900),
    controlling_idea:String(source.controlling_idea||'').trim().slice(0,900),
    genre_tone:String(source.genre_tone||'').trim().slice(0,500),
    world_bible:source.world_bible&&typeof source.world_bible==='object'?source.world_bible:{},
    master_plot:Array.isArray(source.master_plot)?source.master_plot.slice(0,16):[],
    threads:Array.isArray(source.threads)?source.threads.slice(0,16):[],
    cast_slots:slots,
    opening_situation:String(source.opening_situation||'').trim().slice(0,1400),
    ending_direction:String(source.ending_direction||'').trim().slice(0,900)
  };
}

export async function createStoryBlueprint({creativeBrief=''}={}) {
  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.93,
    maxTokens:4800,
    user:{
      task:'Сначала придумай самостоятельную архитектуру нового романа БЕЗ привязки к конкретным существующим персонажам. Сначала история, конфликт, мир, ставки и роли; конкретных героев мы назначим после.',
      creative_brief:String(creativeBrief||'').slice(0,1600),
      output:{
        title:'',
        logline:'',
        controlling_idea:'',
        genre_tone:'',
        world_bible:{},
        master_plot:[],
        threads:[],
        opening_situation:'',
        ending_direction:'',
        cast_slots:[
          {slot_key:'lead_1',narrative_function:'',description:'',interactive:true,required:true,desired_traits:[]},
          {slot_key:'lead_2',narrative_function:'',description:'',interactive:true,required:true,desired_traits:[]},
          {slot_key:'support_1',narrative_function:'',description:'',interactive:false,required:true,desired_traits:[]}
        ]
      },
      hard_rules:[
        'Не используй имена, внешность, биографию или психологию реальных/готовых персонажей: их ещё нет на этом этапе.',
        'Создай 3–6 сюжетных ролей. Ровно две роли interactive=true; остальные роли предназначены для AI-персонажей.',
        'Каждая дополнительная роль должна быть драматургически необходимой: союзник, соперник, свидетель, посредник, антагонист, источник тайны и т.п.',
        'История должна работать до кастинга: если заменить всех персонажей другими, причинно-следственный каркас остаётся состоятельным.',
        'Это взрослая художественная история; все будущие персонажи должны быть 21+.'
      ]
    }
  });
  const blueprint=normalizeStoryBlueprint(data);
  if(!blueprint.title||!blueprint.logline) throw new Error('NOVEL2_STORY_BLUEPRINT_INVALID');
  return blueprint;
}

export async function createStoryBible({characters={},supportingCast=[],blueprint={},relationshipContext={}}={}) {
  const A=characters.A&&typeof characters.A==='object'?characters.A:null;
  const B=characters.B&&typeof characters.B==='object'?characters.B:null;
  if(!A?.passport||!B?.passport) throw new Error('NOVEL2_CHARACTER_CARDS_REQUIRED');

  const storyBlueprint=blueprint?.title?normalizeStoryBlueprint(blueprint):await createStoryBlueprint();
  const supporting=(Array.isArray(supportingCast)?supportingCast:[]).slice(0,6).map(x=>({
    slot_key:String(x?.slot_key||'').slice(0,60),
    narrative_function:String(x?.narrative_function||'').slice(0,500),
    character_card:x?.character_card||{}
  })).filter(x=>x.slot_key&&x.character_card?.passport);

  const assignedCast={
    A,
    B,
    supporting:Object.fromEntries(supporting.map(x=>[x.slot_key,x.character_card]))
  };

  const data=await jsonCompletion({
    system:PROSE_SYSTEM,
    temperature:.86,
    maxTokens:7600,
    user:{
      task:'Теперь засели уже готовую историю конкретными персонажами. Архитектура истории первична: не переписывай основной конфликт под характеры, а найди для каждого назначенного героя естественный способ выполнить его сюжетную функцию.',
      story_blueprint:storyBlueprint,
      assigned_cast:assignedCast,
      supporting_cast_slots:supporting,
      sanitized_pair_dynamics:{
        raw_messages:false,
        observations:Array.isArray(relationshipContext?.observations)?relationshipContext.observations.slice(0,18):[],
        preferences:Array.isArray(relationshipContext?.preferences)?relationshipContext.preferences.slice(0,12):[],
        dynamics:Array.isArray(relationshipContext?.dynamics)?relationshipContext.dynamics.slice(0,10):[]
      },
      character_contract:[
        'A и B — два интерактивных взрослых героя. Их пользователь принимает ключевые решения свободным текстом.',
        'supporting_cast — полноценные AI-персонажи: они могут говорить, действовать, иметь собственные цели, конфликтовать и менять сюжет без отдельного пользовательского хода.',
        'Не ограничивай сцену двумя людьми. Если по истории нужны три, четыре или больше действующих лиц, используй их.',
        'Сохраняй fiction_name, возраст 21+, речевую манеру, внутреннее противоречие и устойчивую внешность каждой Character Card.',
        'Не меняй заранее созданный story_blueprint ради удобства кастинга: персонажи помещаются в историю, а не история строится вокруг их анкет.',
        'Sanitized pair dynamics можно использовать только для ритма общения A/B; не реконструируй исходные сообщения и чувствительные признаки.'
      ],
      output:{
        title:storyBlueprint.title,
        logline:storyBlueprint.logline,
        controlling_idea:storyBlueprint.controlling_idea,
        genre_tone:storyBlueprint.genre_tone,
        world_bible:storyBlueprint.world_bible,
        master_plot:storyBlueprint.master_plot,
        threads:storyBlueprint.threads,
        story_blueprint:storyBlueprint,
        player_characters:{A,B},
        supporting_characters:Object.fromEntries(supporting.map(x=>[x.slot_key,x.character_card])),
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
        'Начни с opening_situation story_blueprint и конкретного действия, а не с анкеты.',
        'Первая сцена должна быть полноценным литературным эпизодом: ориентир 5500–9500 знаков, 8–14 абзацев, 3–5 драматургических битов.',
        'Используй дополнительные AI-роли уже в первой сцене, если это естественно для opening_situation.',
        'characters_present содержит slot_key/идентификаторы реально присутствующих персонажей. Для интерактивных игроков используй A и B; для AI — их slot_key.',
        'visual_scene точно фиксирует локацию, присутствующих героев, положение тел, одежду, предметы и свет.',
        'Первая сцена заканчивается значимым выбором A или B, а не обязательным ходом каждого присутствующего персонажа.'
      ]
    }
  });
  let first=cleanScene(data.first_scene||{});
  if(!data.title||first.prose.length<500) throw new Error('NOVEL2_BIBLE_INVALID');
  const bible={...data,story_blueprint:storyBlueprint,player_characters:{A,B},supporting_characters:Object.fromEntries(supporting.map(x=>[x.slot_key,x.character_card]))};
  first=await ensureLongScene(first,{storyBible:bible,reason:'first_scene'});
  if(first.prose.length<2500) throw new Error('NOVEL2_BIBLE_TOO_SHORT');
  return {...bible,first_scene:first};
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
        'Сверяй действия и реплики с player_characters и supporting_characters из story_bible: все присутствующие характеры должны влиять на продолжение.',
        'AI-персонажи из supporting_characters сами говорят и действуют внутри сцены; для них не создавай пользовательский target_role.',
        'Следующий активный герой обычно другой игрок, если драматургически нет веской причины оставить ход текущему.',
        'visual_scene должен строго соответствовать только что написанной сцене: та же локация, те же физически присутствующие герои, их одежда, позы, реквизит и время/свет.',
        'Не помещай героя в characters_present, если по прозе его физически нет в этой локации.',
        'characters_present может содержать A, B и slot_key любых supporting_characters; не ограничивай кадр двумя персонажами.'
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
