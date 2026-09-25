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
