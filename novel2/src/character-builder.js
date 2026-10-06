import {jsonCompletion} from './ai.js';

const CHARACTER_BUILDER_SYSTEM=`
Ты — Character Builder для Interactive Novel 2.0.

Твоя задача — на основе уже полученного Visual Identity Profile и пожеланий пользователя создать художественного персонажа для интерактивного романа двух взрослых игроков.

ВАЖНО
— Visual Identity Profile содержит наблюдаемые внешние признаки. Не искажай их.
— Психология, биография, романтическая динамика и сюжетная роль — ХУДОЖЕСТВЕННАЯ ФИКЦИЯ, а не вывод о реальном человеке.
— Не приписывай реальному человеку политические, религиозные, медицинские, этнические, сексуальные и другие чувствительные характеристики.
— Не сравнивай с реальными знаменитостями.
— Все персонажи строго 21+.
— Если пользователь не указал имя, возраст, профессию или характер, создай их как свойства вымышленного героя.
— Не копируй конкретного автора, роман или узнаваемые фразы.

ЛИТЕРАТУРНАЯ ФУНКЦИЯ
Персонаж должен быть пригоден для современной коммерческой dark erotic romance:
— психологически читаемый;
— с внутренним противоречием;
— со своей речевой манерой;
— с точкой притяжения и точкой сопротивления;
— эротическое напряжение строится на подтексте, власти, дистанции, паузах, материальных деталях и выборе, а не на анатомической прямолинейности.

VISUAL DNA
Сохрани устойчивые признаки внешности из Visual Identity Profile.
Раздели:
— immutable visual traits: нельзя менять между сценами;
— variable scene traits: одежда, укладка, свет, выражение, состояние;
— unknown traits: то, чего нельзя надёжно установить по исходным фото.

Верни только JSON.
`;

function arr(v,max=8){
  return (Array.isArray(v)?v:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,max);
}
function text(v,max=1200){return String(v||'').trim().slice(0,max);}

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
      based_on_user_references:true,
      adult_only:true
    }
  };
}

export async function buildCharacterCard({role,visualProfile={},userFacts={},referenceCount=1}){
  if(!['A','B'].includes(role))throw new Error('NOVEL2_CHARACTER_ROLE_INVALID');
  const output=await jsonCompletion({
    system:CHARACTER_BUILDER_SYSTEM,
    temperature:.78,
    maxTokens:5200,
    user:{
      task:'Создай полную карточку художественного персонажа на основе Visual Identity Profile. Внешность сохраняй, психологию и сюжетную функцию создавай как художественную фикцию.',
      player_role:role,
      reference_count:referenceCount,
      visual_identity_profile:visualProfile,
      user_preferences:userFacts,
      output_schema:{
        passport:{
          fiction_name:'',age:28,gender:'',story_role:'',archetype:'',biography:'',story_hook:''
        },
        visual:{
          general_impression:'',face:'',hair:'',eyes:'',build:'',posture_motion:'',wardrobe_style:'',
          signature_markers:[],immutable_traits:[],variable_traits:[],unknown_traits:[]
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
      },
      hard_rules:[
        'Возраст персонажа не меньше 21 года.',
        'Не выдавай выдуманную психологию за реальную оценку человека на фото.',
        'Если на фото не видно тело целиком, не выдумывай точные пропорции: перенеси это в unknown_traits.',
        'Если пользователь дал пожелания, они имеют приоритет над автоматически созданной художественной биографией.',
        'Карточка должна быть пригодна одновременно для prose engine и visual engine.'
      ]
    }
  });
  return normalizeCharacterCard(output,role);
}
