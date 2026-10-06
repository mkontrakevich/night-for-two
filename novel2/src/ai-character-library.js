function card({name,age,role,archetype,hook,temperament,speech,contradiction,visual,romance}) {
  return {
    role:'AI',
    passport:{
      fiction_name:name,
      age,
      gender:'',
      story_role:role,
      archetype,
      biography:'',
      story_hook:hook
    },
    visual:{
      general_impression:visual.impression,
      face:visual.face,
      hair:visual.hair,
      eyes:visual.eyes,
      build:visual.build,
      posture_motion:visual.posture,
      wardrobe_style:visual.wardrobe,
      signature_markers:visual.markers,
      immutable_traits:visual.markers,
      variable_traits:['wardrobe','expression','scene lighting'],
      unknown_traits:[]
    },
    psychology:{
      temperament,
      speech_style:speech,
      public_goal:'',
      hidden_need:'',
      contradiction,
      weakness:'',
      tension_point:''
    },
    romance:{
      attraction_type:romance,
      dynamic:'',
      boundaries:'',
      emotional_triggers:[],
      tension_mechanics:[]
    },
    literary_portrait:hook,
    visual_dna:{
      short_visual_summary:visual.impression,
      stable_core_traits:visual.markers,
      appearance_anchor_prompt:[visual.face,visual.hair,visual.eyes,visual.build,visual.posture].filter(Boolean).join('; '),
      wardrobe_anchor:visual.wardrobe,
      mood_anchor:'',
      negative_prompt:'identity drift, face swap, age drift, beauty-filter face, duplicated person',
      consistency_rules:['preserve face geometry','preserve hairline','preserve body proportions','preserve age'],
      do_not_change:visual.markers
    },
    story_start:{
      best_first_scene:'',
      best_counterpart_contrast:'',
      first_spark:'',
      hidden_danger:''
    },
    builder_notes:{
      fictionalized:true,
      based_on_user_references:false,
      synthetic_standin:false,
      reusable_ai_library:true,
      adult_only:true
    }
  };
}

function profile({face,hair,body,markers}) {
  return {
    face:{
      overall_shape:face.shape,
      jaw:face.jaw,
      cheekbones:face.cheekbones,
      brow:face.brow,
      eyes_visual:face.eyes,
      nose_geometry:face.nose,
      mouth_geometry:face.mouth
    },
    hair:{
      color:hair.color,
      length:hair.length,
      texture:hair.texture,
      hairline:hair.hairline,
      default_style:hair.style
    },
    body:{
      height:body.height,
      relative_height:body.relative_height,
      build:body.build,
      shoulder_waist_ratio:body.ratio,
      limb_proportions:body.limbs,
      posture:body.posture
    },
    distinctive_geometry:markers,
    appearance_notes:[],
    stable_core_traits:markers,
    variable_traits:['clothing','expression','lighting'],
    unknown_traits:[],
    reference_coverage:{
      face_confidence:'high',
      profile_confidence:'high',
      body_confidence:'high',
      missing_views:[]
    },
    do_not_drift:markers
  };
}

export const PRESET_AI_CHARACTERS=[
  {
    id:'ai_ada',
    tags:['sharp','controlled','urban','strategist'],
    card:card({
      name:'Ада Воронова',age:34,role:'стратег / человек, который всегда знает больше остальных',archetype:'холодный архитектор ситуации',
      hook:'Она входит в чужой конфликт не ради спасения, а ради контроля над тем, чем он закончится.',
      temperament:'сдержанная, наблюдательная, быстро принимает решения и редко объясняет мотивы',
      speech:'короткие точные фразы, сухая ирония, почти никогда не повышает голос',
      contradiction:'нуждается в доверии, но строит всё так, чтобы ни от кого не зависеть',
      romance:'интеллектуальное напряжение, власть, сопротивление',
      visual:{
        impression:'высокая стройная женщина с собранной осанкой и строгой пластикой',
        face:'удлинённо-овальное лицо, чёткая нижняя линия, высокие скулы, прямой нос',
        hair:'тёмные прямые волосы до ключиц, центральный пробор',
        eyes:'миндалевидные тёмные глаза, прямой устойчивый взгляд',
        build:'стройное вытянутое телосложение, длинные конечности',
        posture:'ровная спина, медленные экономные движения',
        wardrobe:'минималистичная тёмная одежда, структурированные жакеты, чистые линии',
        markers:['удлинённое лицо','высокие скулы','прямой нос','центральный пробор','длинные тёмные волосы','высокий рост']
      }
    }),
    profile:profile({
      face:{shape:'elongated oval',jaw:'defined narrow jaw',cheekbones:'high pronounced cheekbones',brow:'straight dark brows',eyes:'almond dark eyes, medium spacing',nose:'straight narrow bridge',mouth:'medium lips, restrained resting expression'},
      hair:{color:'dark brown',length:'collarbone',texture:'straight',hairline:'even natural hairline',style:'center part, straight'},
      body:{height:'tall',relative_height:'taller than average adult woman',build:'slim elongated build',ratio:'narrow waist, balanced shoulders',limbs:'long limbs',posture:'upright controlled posture'},
      markers:['elongated oval face','high cheekbones','straight narrow nose','center-part dark hair','long-limbed tall build']
    })
  },
  {
    id:'ai_lev',
    tags:['charismatic','dangerous','warm','operator'],
    card:card({
      name:'Лев Арден',age:37,role:'посредник / человек с доступом туда, куда другим нельзя',archetype:'обаятельный оператор',
      hook:'Он умеет открыть любую дверь, но никогда не говорит, какую цену уже заплатил за ключ.',
      temperament:'обаятельный, импровизационный, внимательный к слабым местам людей',
      speech:'спокойная разговорная речь, полушутки, вопросы вместо прямых признаний',
      contradiction:'любит свободу, но постоянно создаёт связи, которые не может бросить',
      romance:'провокация, игра дистанцией, неожиданная надёжность',
      visual:{
        impression:'атлетичный мужчина среднего-высокого роста с расслабленной уверенностью',
        face:'прямоугольное лицо, выраженная челюсть, мягко очерченные скулы',
        hair:'тёмно-русые слегка волнистые волосы средней короткой длины',
        eyes:'серо-зелёные глаза, немного тяжёлые верхние веки',
        build:'атлетичное сухое телосложение, широкие плечи',
        posture:'расслабленные плечи, уверенная походка',
        wardrobe:'дорогая неформальная одежда, рубашки без галстука, тёмные пальто',
        markers:['прямоугольная форма лица','выраженная челюсть','слегка волнистые тёмно-русые волосы','серо-зелёные глаза','широкие плечи']
      }
    }),
    profile:profile({
      face:{shape:'rectangular',jaw:'strong squared jaw',cheekbones:'moderate defined cheekbones',brow:'medium straight brows',eyes:'gray-green eyes with slightly heavy upper lids',nose:'straight medium-width nose',mouth:'wide expressive mouth'},
      hair:{color:'dark blond',length:'short-medium',texture:'slightly wavy',hairline:'natural mature hairline',style:'casual swept back'},
      body:{height:'medium-tall',relative_height:'above average adult man',build:'lean athletic build',ratio:'broad shoulders, narrow waist',limbs:'balanced athletic proportions',posture:'relaxed confident posture'},
      markers:['rectangular face','strong jaw','wavy dark-blond hair','gray-green eyes','broad shoulders']
    })
  },
  {
    id:'ai_mara',
    tags:['artistic','volatile','intuitive','outsider'],
    card:card({
      name:'Мара Кейн',age:29,role:'художник / свидетель, который замечает то, что остальные пропускают',archetype:'непредсказуемый наблюдатель',
      hook:'Она кажется случайным человеком в комнате, пока не становится ясно, что именно она видела главное.',
      temperament:'интуитивная, эмоционально быстрая, независимая, любопытная',
      speech:'образные короткие реплики, внезапные точные наблюдения, не любит объяснять очевидное',
      contradiction:'хочет оставаться вне чужих историй, но всегда входит в них глубже всех',
      romance:'любопытство, импульс, эмоциональная честность',
      visual:{
        impression:'невысокая гибкая женщина с живой мимикой и резкой сменой пластики',
        face:'сердцевидное лицо, узкий подбородок, заметные скулы',
        hair:'медно-каштановые кудрявые волосы чуть ниже плеч',
        eyes:'светло-карие крупные глаза',
        build:'тонкое гибкое телосложение',
        posture:'подвижная осанка, часто переносит вес на одну ногу',
        wardrobe:'слои фактурной одежды, кожаная куртка, свободные рубашки, крупные кольца',
        markers:['сердцевидное лицо','узкий подбородок','медно-каштановые кудри','крупные светло-карие глаза','невысокий рост']
      }
    }),
    profile:profile({
      face:{shape:'heart-shaped',jaw:'narrow jaw and pointed chin',cheekbones:'prominent cheekbones',brow:'soft arched brows',eyes:'large light-brown eyes',nose:'small straight nose',mouth:'full mobile mouth'},
      hair:{color:'copper chestnut',length:'below shoulders',texture:'curly',hairline:'soft natural hairline',style:'loose curls'},
      body:{height:'short-medium',relative_height:'below average adult woman',build:'slim flexible build',ratio:'narrow shoulders and waist',limbs:'slender proportions',posture:'mobile asymmetric posture'},
      markers:['heart-shaped face','pointed chin','copper curls','large light-brown eyes','short-medium height']
    })
  },
  {
    id:'ai_nolan',
    tags:['quiet','protective','technical','witness'],
    card:card({
      name:'Нолан Рид',age:41,role:'инженер / человек, который знает, как всё устроено внутри',archetype:'молчаливый хранитель фактов',
      hook:'Он никогда не вмешивается первым, но если вмешался — значит, система уже близка к разрушению.',
      temperament:'спокойный, терпеливый, методичный, с сильным чувством ответственности',
      speech:'редкие простые фразы, техническая точность, без демонстративной эмоциональности',
      contradiction:'избегает власти над людьми, хотя постоянно оказывается тем, от кого зависит исход',
      romance:'надёжность, сдержанность, доверие через действие',
      visual:{
        impression:'крупный мужчина с спокойной тяжёлой пластикой и внимательным лицом',
        face:'широкое овально-квадратное лицо, массивная челюсть',
        hair:'очень короткие тёмные волосы с заметной сединой у висков',
        eyes:'тёмно-карие глубоко посаженные глаза',
        build:'крупное крепкое телосложение',
        posture:'устойчивая спокойная стойка, минимум лишних движений',
        wardrobe:'простые качественные куртки, плотные рубашки, нейтральные брюки',
        markers:['широкое лицо','массивная челюсть','короткие тёмные волосы','седина на висках','крупное крепкое телосложение']
      }
    }),
    profile:profile({
      face:{shape:'broad oval-square',jaw:'heavy broad jaw',cheekbones:'low broad cheekbones',brow:'thick straight brows',eyes:'deep-set dark-brown eyes',nose:'broad straight nose',mouth:'medium firm mouth'},
      hair:{color:'dark brown with gray temples',length:'very short',texture:'straight',hairline:'slightly mature hairline',style:'close crop'},
      body:{height:'medium-tall',relative_height:'above average adult man',build:'large sturdy build',ratio:'broad shoulders and torso',limbs:'solid balanced proportions',posture:'stable economical posture'},
      markers:['broad oval-square face','heavy jaw','gray temples','deep-set dark eyes','large sturdy build']
    })
  },
  {
    id:'ai_sophia',
    tags:['elegant','social','ambiguous','insider'],
    card:card({
      name:'София Белл',age:32,role:'куратор / человек, который соединяет нужных людей',archetype:'социальный проводник',
      hook:'Её талант — заставить людей встретиться именно тогда, когда они предпочли бы разминуться.',
      temperament:'социально точная, обаятельная, дисциплинированная, наблюдательная',
      speech:'мягкая ясная речь, точные имена и детали, умеет сделать угрозу похожей на приглашение',
      contradiction:'любит управлять связями между людьми, но боится оказаться внутри чужой зависимости',
      romance:'элегантная провокация, социальная власть, медленное сближение',
      visual:{
        impression:'женщина среднего роста с безупречной собранностью и мягкой пластикой',
        face:'мягкое овальное лицо, округлые скулы, аккуратная челюсть',
        hair:'светло-каштановое каре до подбородка',
        eyes:'голубовато-серые глаза',
        build:'стройное пропорциональное телосложение',
        posture:'собранная прямая осанка, точные жесты рук',
        wardrobe:'светлые костюмы, лаконичные платья, минималистичные украшения',
        markers:['мягкое овальное лицо','каре до подбородка','голубовато-серые глаза','точные жесты','средний рост']
      }
    }),
    profile:profile({
      face:{shape:'soft oval',jaw:'soft neat jaw',cheekbones:'rounded moderate cheekbones',brow:'fine shaped brows',eyes:'blue-gray eyes',nose:'small straight nose',mouth:'defined medium lips'},
      hair:{color:'light chestnut',length:'chin-length',texture:'straight',hairline:'even hairline',style:'clean bob'},
      body:{height:'medium',relative_height:'average adult woman',build:'slim proportional build',ratio:'balanced shoulders and waist',limbs:'balanced proportions',posture:'upright polished posture'},
      markers:['soft oval face','chin-length light chestnut bob','blue-gray eyes','balanced slim build','precise hand gestures']
    })
  },
  {
    id:'ai_daniel',
    tags:['law','controlled','skeptical','rival'],
    card:card({
      name:'Даниэль Кроу',age:39,role:'юрист / противник, который предпочитает правила прямому конфликту',archetype:'цивилизованный антагонист',
      hook:'Он почти никогда не нарушает правила — ему проще устроить так, чтобы правила нарушили другие.',
      temperament:'рациональный, выдержанный, соревновательный, внимательный к формулировкам',
      speech:'медленная точная речь, юридическая ясность без канцелярита, редкие холодные шутки',
      contradiction:'верит в контроль через правила, но сильнее всего его привлекает то, что невозможно формализовать',
      romance:'сопротивление, интеллектуальное соперничество, скрытая уязвимость',
      visual:{
        impression:'подтянутый мужчина с строгой геометрией лица и формальной пластикой',
        face:'узкое прямоугольное лицо, выраженные скулы, чёткая челюсть',
        hair:'чёрные прямые волосы короткой длины, зачёс назад',
        eyes:'тёмные глаза под прямыми бровями',
        build:'стройное подтянутое телосложение',
        posture:'прямая формальная осанка, точные повороты корпуса',
        wardrobe:'тёмные костюмы без лишних деталей, длинные пальто',
        markers:['узкое прямоугольное лицо','выраженные скулы','чёрные волосы зачёсом назад','тёмные глаза','строгая осанка']
      }
    }),
    profile:profile({
      face:{shape:'narrow rectangular',jaw:'defined angular jaw',cheekbones:'prominent sharp cheekbones',brow:'straight dark brows',eyes:'dark deep eyes',nose:'long straight nose',mouth:'narrow defined mouth'},
      hair:{color:'black',length:'short',texture:'straight',hairline:'clean mature hairline',style:'swept back'},
      body:{height:'medium-tall',relative_height:'above average adult man',build:'lean fit build',ratio:'moderate shoulders, narrow waist',limbs:'long balanced limbs',posture:'formal upright posture'},
      markers:['narrow rectangular face','sharp cheekbones','black swept-back hair','dark eyes','lean formal silhouette']
    })
  }
];
