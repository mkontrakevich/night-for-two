export const NIGHT_REFERENCE_MECHANICS=Object.freeze([
  {key:'calendar_progression',pattern:'разбить тему на короткую серию с видимым прогрессом'},
  {key:'reveal_card',pattern:'скрыть содержание до явного действия пользователя и затем показать один шаг'},
  {key:'two_options',pattern:'дать два совместимых варианта и позволить паре выбрать один'},
  {key:'role_lead',pattern:'один задаёт направление, затем роли меняются'},
  {key:'private_priority',pattern:'каждый делает скрытый выбор, наружу выводится только совместимый итог'},
  {key:'preparation',pattern:'подготовить предмет, атмосферу, музыку, одежду или пространство'},
  {key:'location_shift',pattern:'сменить приватную обстановку или точку начала сцены'},
  {key:'sensory_contrast',pattern:'безопасно менять текстуру, свет, звук, температуру или ожидание'},
  {key:'outfit_visual',pattern:'использовать одежду, аксессуар или визуальный образ как атмосферный триггер'},
  {key:'randomizer',pattern:'выбирать только из заранее допустимого набора'},
  {key:'feedback_rating',pattern:'после эпизода получить короткую приватную реакцию'},
  {key:'heat_progression',pattern:'повышать интенсивность только при взаимно положительной обратной связи'}
]);

export function nightReferencePromptDigest(){
  return NIGHT_REFERENCE_MECHANICS.map(x=>({key:x.key,pattern:x.pattern}));
}

export const NIGHT_REFERENCE_CATEGORIES=Object.freeze([
  {key:'getting_closer',title:'Знакомство заново',goal:'вопросы, открытия и новый взгляд на партнёра',mechanics:['reveal_card','two_options','role_lead','feedback_rating']},
  {key:'tender',title:'Нежность',goal:'мягкая близость, внимание и безопасный телесный контакт',mechanics:['reveal_card','role_lead','sensory_contrast','feedback_rating']},
  {key:'acrobatics',title:'Новый ракурс',goal:'игровое исследование позы, движения и инициативы без спортивной сложности',mechanics:['two_options','role_lead','randomizer','feedback_rating']},
  {key:'wordplay',title:'Слова и фантазия',goal:'реплики, роли, вопросы и игровые формулировки между партнёрами',mechanics:['reveal_card','two_options','private_priority','role_lead']},
  {key:'coupons',title:'Купоны',goal:'отложенное обещание или привилегия, которую пара активирует добровольно',mechanics:['reveal_card','private_priority','randomizer','feedback_rating']},
  {key:'fetish_explore',title:'Исследуем интересы',goal:'бережно проверять фантазии и границы без давления',mechanics:['private_priority','two_options','heat_progression','feedback_rating']},
  {key:'sensory',title:'Новые ощущения',goal:'свет, звук, текстуры, ожидание и сенсорный контраст',mechanics:['preparation','sensory_contrast','randomizer','feedback_rating']},
  {key:'roleplay',title:'Роли',goal:'короткая игровая ситуация с распределением инициативы и сменой ролей',mechanics:['preparation','outfit_visual','role_lead','location_shift']}
]);

export function nightReferenceCategory(stage=0){return NIGHT_REFERENCE_CATEGORIES[Math.abs(Number(stage)||0)%NIGHT_REFERENCE_CATEGORIES.length];}
