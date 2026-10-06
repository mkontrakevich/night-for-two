import {jsonCompletion} from './ai.js';

const CHARACTER_BUILDER_SYSTEM=`
Ты — Character Builder для Interactive Novel 2.0.

Твоя задача — создать художественного персонажа для интерактивного романа двух взрослых игроков.

У тебя могут быть три разных источника:
1. Visual Identity Profile — наблюдаемая внешность по фото.
2. Sanitized Pair Communication Profile — агрегированные, очищенные наблюдения о стиле общения пары.
3. User preferences — прямые пожелания пользователя к художественному персонажу.

ГЛАВНОЕ ПРАВИЛО ХАРАКТЕРА
Если Sanitized Pair Communication Profile доступен, он является БАЗОВОЙ ОСНОВОЙ поведения героя:
— манера общения;
— темп общения;
— инициатива;
— поддержка;
— планирование;
— социальный ритм;
— повторяющиеся коммуникативные паттерны.

Это не психологический диагноз и не полное описание реального человека. Это только наблюдаемый поведенческий baseline из общения.

НЕЛЬЗЯ выводить из переписки:
— сексуальные предпочтения или границы;
— сексуальную ориентацию;
— здоровье или диагнозы;
— религию;
— политические взгляды;
— этничность;
— травмы;
— другие чувствительные характеристики.

Романтическую/эротическую часть создавай как ХУДОЖЕСТВЕННУЮ ФИКЦИЮ, если пользователь сам её явно не задал. Не выдавай её за вывод из переписки.

ВАЖНО
— Visual Identity Profile содержит наблюдаемые внешние признаки. Не искажай их.
— Биография, сюжетная роль, внутренний конфликт и художественная драматургия — фикция.
— Если пользователь явно задал характер, совмести его с наблюдаемым communication baseline; прямое пожелание пользователя имеет приоритет.
— Если наблюдения противоречат друг другу, используй это как естественную неоднозначность характера, а не как ошибку.
— Чем выше confidence и evidence_count, тем сильнее наблюдение влияет на baseline.
— Не цитируй и не восстанавливай исходные личные сообщения.
— Не сравнивай с реальными знаменитостями.
— Все персонажи строго 21+.
— Не копируй конкретного автора, роман или узнаваемые фразы.

ЛИТЕРАТУРНАЯ ФУНКЦИЯ
Персонаж должен быть пригоден для современной коммерческой dark erotic romance:
— психологически читаемый;
— с внутренним противоречием;
— со своей речевой манерой;
— с точкой притяжения и точкой сопротивления;
— чувственное напряжение строится на подтексте, власти, дистанции, паузах, материальных деталях и выборе.

VISUAL DNA
Сохрани устойчивые признаки внешности из Visual Identity Profile.
Раздели:
— immutable visual traits;
— variable scene traits;
— unknown traits.

Верни только JSON.
`;

function arr(v,max=8){
  return (Array.isArray(v)?v:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,max);
}
function text(v,max=1200){return String(v||'').trim().slice(0,max);}
function confidence(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}

function normalizeBehavior(raw={}){
  return {
    source:text(raw.source||'fictional_default',80),
    relationship_grounded:Boolean(raw.relationship_grounded),
    confidence:confidence(raw.confidence),
    communication_style:text(raw.communication_style,600),
    initiative_pattern:text(raw.initiative_pattern,500),
    pace_style:text(raw.pace_style,500),
    support_style:text(raw.support_style,500),
    planning_style:text(raw.planning_style,500),
    social_rhythm:text(raw.social_rhythm,500),
    attention_language:text(raw.attention_language,500),
    observed_patterns:arr(raw.observed_patterns,10),
    couple_dynamics_used:arr(raw.couple_dynamics_used,8)
  };
}

export function normalizeCharacterCard(raw={},role='A'){
  const passport=raw.passport&&typeof raw.passport==='object'?raw.passport:{};
  const visual=raw.visual&&typeof raw.visual==='object'?raw.visual:{};
  const psych=raw.psychology&&typeof raw.psychology==='object'?raw.psychology:{};
  const romance=raw.romance&&typeof raw.romance==='object'?raw.romance:{};
  const dna=raw.visual_dna&&typeof raw.visual_dna==='object'?raw.visual_dna:{};
  const story=raw.story_start&&typeof raw.story_start==='object'?raw.story_start:{};
  const age=Math.max(21,Number(passport.age)||28);
  return {
    role,
    passport:{
      fiction_name:text(passport.fiction_name||passport.name||`Герой ${role}`,80),
      age,
      gender:text(passport.gender,50),
      story_role:text(passport.story_role||passport.role,160),
      archetype:text(passport.archetype,160),
      biography:text(passport.biography,1200),
      story_hook:text(passport.story_hook,500)
    },
    visual:{
      general_impression:text(visual.general_impression,600),
      face:text(visual.face,800),
      hair:text(visual.hair,500),
      eyes:text(visual.eyes,300),
      build:text(visual.build,500),
      posture_motion:text(visual.posture_motion,500),
      wardrobe_style:text(visual.wardrobe_style,600),
      signature_markers:arr(visual.signature_markers,6),
      immutable_traits:arr(visual.immutable_traits,10),
      variable_traits:arr(visual.variable_traits,10),
      unknown_traits:arr(visual.unknown_traits,10)
    },
    behavioral_baseline:normalizeBehavior(raw.behavioral_baseline||{}),
    psychology:{
      temperament:text(psych.temperament,500),
      speech_style:text(psych.speech_style,500),
      public_goal:text(psych.public_goal,500),
      hidden_need:text(psych.hidden_need,500),
      contradiction:text(psych.contradiction,500),
      weakness:text(psych.weakness,500),
      tension_point:text(psych.tension_point,500)
    },
    romance:{
      attraction_type:text(romance.attraction_type,500),
      dynamic:text(romance.dynamic,600),
      boundaries:text(romance.boundaries,600),
      emotional_triggers:arr(romance.emotional_triggers,8),
      tension_mechanics:arr(romance.tension_mechanics,8)
    },
    literary_portrait:text(raw.literary_portrait,1800),
    visual_dna:{
      short_visual_summary:text(dna.short_visual_summary,800),
      stable_core_traits:arr(dna.stable_core_traits,12),
      appearance_anchor_prompt:text(dna.appearance_anchor_prompt,1800),
      wardrobe_anchor:text(dna.wardrobe_anchor,800),
      mood_anchor:text(dna.mood_anchor,800),
      negative_prompt:text(dna.negative_prompt,1200),
      consistency_rules:arr(dna.consistency_rules,14),
      do_not_change:arr(dna.do_not_change,14)
    },
    story_start:{
      best_first_scene:text(story.best_first_scene,700),
      best_counterpart_contrast:text(story.best_counterpart_contrast,700),
      first_spark:text(story.first_spark,700),
      hidden_danger:text(story.hidden_danger,700)
    },
    builder_notes:{
      fictionalized:true,
      based_on_user_references:Boolean(raw.builder_notes?.based_on_user_references??true),
      relationship_grounded:Boolean(raw.behavioral_baseline?.relationship_grounded),
      adult_only:true
    }
  };
}

function outputSchema(){
  return {
    passport:{
      fiction_name:'',age:28,gender:'',story_role:'',archetype:'',biography:'',story_hook:''
    },
    visual:{
      general_impression:'',face:'',hair:'',eyes:'',build:'',posture_motion:'',wardrobe_style:'',
      signature_markers:[],immutable_traits:[],variable_traits:[],unknown_traits:[]
    },
    behavioral_baseline:{
      source:'sanitized_pair_communication|fictional_default',
      relationship_grounded:true,
      confidence:.8,
      communication_style:'',
      initiative_pattern:'',
      pace_style:'',
      support_style:'',
      planning_style:'',
      social_rhythm:'',
      attention_language:'',
      observed_patterns:[],
      couple_dynamics_used:[]
    },
    psychology:{
      temperament:'',speech_style:'',public_goal:'',hidden_need:'',contradiction:'',weakness:'',tension_point:''
    },
    romance:{
      attraction_type:'',dynamic:'',boundaries:'',emotional_triggers:[],tension_mechanics:[]
    },
    literary_portrait:'',
    visual_dna:{
      short_visual_summary:'',stable_core_traits:[],appearance_anchor_prompt:'',wardrobe_anchor:'',
      mood_anchor:'',negative_prompt:'',consistency_rules:[],do_not_change:[]
    },
    story_start:{
      best_first_scene:'',best_counterpart_contrast:'',first_spark:'',hidden_danger:''
    }
  };
}

export async function buildCharacterCard({role,visualProfile={},userFacts={},referenceCount=1,relationshipContext={}}){
  if(!['A','B'].includes(role))throw new Error('NOVEL2_CHARACTER_ROLE_INVALID');
  const grounded=Array.isArray(relationshipContext?.observations)&&relationshipContext.observations.length>0;
  const output=await jsonCompletion({
    system:CHARACTER_BUILDER_SYSTEM,
    temperature:.68,
    maxTokens:5600,
    user:{
      task:'Создай полную карточку художественного персонажа. Если есть sanitized_pair_communication, используй его как базовый behavioral baseline героя. Внешность бери из Visual Identity Profile. Остальную драматургию создавай как художественную фикцию.',
      player_role:role,
      reference_count:referenceCount,
      visual_identity_profile:visualProfile,
      sanitized_pair_communication:relationshipContext,
      relationship_context_available:grounded,
      user_preferences:userFacts,
      output_schema:outputSchema(),
      hard_rules:[
        'Возраст персонажа не меньше 21 года.',
        'Манера речи, инициатива, темп, поддержка и планирование должны опираться на sanitized_pair_communication, если он доступен.',
        'Не превращай коммуникационные наблюдения в диагноз или глобальную оценку личности.',
        'Не выводи интимные предпочтения, границы или сексуальные характеристики из переписки.',
        'Романтические свойства, которых пользователь не задавал явно, являются художественной фикцией.',
        'Не цитируй исходные сообщения пары и не пытайся их реконструировать.',
        'Если на фото не видно тело целиком, не выдумывай точные пропорции: перенеси это в unknown_traits.',
        'Если пользователь дал пожелания, они имеют приоритет над автоматически созданной художественной биографией.',
        'Карточка должна быть пригодна одновременно для prose engine и visual engine.'
      ]
    }
  });
  const card=normalizeCharacterCard(output,role);
  card.builder_notes.based_on_user_references=true;
  return card;
}

export async function buildSyntheticCharacter({role,counterpartCard={},relationshipContext={}}){
  if(!['A','B'].includes(role))throw new Error('NOVEL2_CHARACTER_ROLE_INVALID');
  const grounded=Array.isArray(relationshipContext?.observations)&&relationshipContext.observations.length>0;
  const output=await jsonCompletion({
    system:CHARACTER_BUILDER_SYSTEM,
    temperature:.90,
    maxTokens:6400,
    user:{
      task:'Создай временного взрослого персонажа для отсутствующего второго игрока. ВНЕШНОСТЬ должна быть полностью вымышленной и случайной, но ПОВЕДЕНЧЕСКИЙ BASELINE должен опираться на sanitized_pair_communication этого участника, если такие наблюдения уже существуют.',
      player_role:role,
      counterpart_character:counterpartCard||{},
      sanitized_pair_communication:relationshipContext,
      relationship_context_available:grounded,
      randomization_rules:[
        'Выбери конкретное лицо, волосы, телосложение, осанку и 4–6 отличительных визуальных маркеров.',
        'Не используй знаменитостей и не описывай персонажа как копию реального человека.',
        'Возраст строго 21+.',
        'Внешность является случайной художественной оболочкой и не должна выводиться из переписки.',
        'Если коммуникационный профиль отсутствующего участника есть, сохрани его наблюдаемый стиль общения, инициативу, темп, поддержку и ритм как behavioral baseline.',
        'Не выводи из переписки интимные, медицинские, религиозные, политические или другие чувствительные свойства.',
        'Создай визуальный контраст с уже существующим персонажем, но не превращай его в карикатуру.',
        'Не оставляй unknown_traits для базовых визуальных признаков: это полностью вымышленная внешность.',
        'После создания внешность считается неизменным каноном.'
      ],
      output_schema:{
        visual_profile:{
          face:{overall_shape:'',jaw:'',cheekbones:'',brow:'',eyes_visual:'',nose_geometry:'',mouth_geometry:''},
          hair:{color:'',length:'',texture:'',hairline:'',default_style:''},
          body:{height:'',relative_height:'',build:'',shoulder_waist_ratio:'',limb_proportions:'',posture:''},
          distinctive_geometry:[],
          appearance_notes:[],
          stable_core_traits:[],
          variable_traits:[],
          unknown_traits:[],
          reference_coverage:{face_confidence:'high',profile_confidence:'high',body_confidence:'high',missing_views:[]},
          do_not_drift:[]
        },
        character_card:outputSchema()
      }
    }
  });
  const visualProfile=output?.visual_profile&&typeof output.visual_profile==='object'?output.visual_profile:{};
  const characterCard=normalizeCharacterCard(output?.character_card||{},role);
  characterCard.builder_notes={
    fictionalized:true,
    based_on_user_references:false,
    relationship_grounded:Boolean(characterCard.behavioral_baseline?.relationship_grounded),
    synthetic_standin:true,
    adult_only:true
  };
  if(!visualProfile?.face||!visualProfile?.hair||!visualProfile?.body)throw new Error('NOVEL2_SYNTHETIC_VISUAL_INVALID');
  return {visualProfile,characterCard};
}
