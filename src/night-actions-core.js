// An independent companion experience for Room 17. No messages or bot analysis enter this model.
export const ACTION_SCENES=Object.freeze([
  {id:'key',chapter:'Ключ',motif:'серебряный ключ',story:'Марк протягивает Еве ключ. Продолжить путь можно только вместе.'},
  {id:'corridor',chapter:'Коридор',motif:'коридор после полуночи',story:'Они останавливаются перед дверью, которой нет на плане.'},
  {id:'room17',chapter:'Комната №17',motif:'запечатанный конверт',story:'В комнате ждёт письмо. Открыть его одному означало бы потерять смысл этой ночи.'}
]);
export const ACTION_PERMISSIONS=Object.freeze(['words','embrace','kiss','touch']);
const rank=p=>ACTION_PERMISSIONS.indexOf(p);
export function effectiveAction(a,b){
  if(!a||!b)return null;
  if(a==='skip'||b==='skip')return 'skip';
  const x=rank(a),y=rank(b);
  if(x<0||y<0)throw new Error('ACTION_CHOICE_INVALID');
  return ACTION_PERMISSIONS[Math.min(x,y)];
}
export function actionCard(stage,permission,context={}){
  const scene=ACTION_SCENES[stage];
  if(!scene)throw new Error('ACTION_SCENE_INVALID');
  if(permission==='skip')return {title:'Продолжить историю',text:'Оставьте эту сцену в книге и переходите дальше. Ничего объяснять не требуется.',scene:scene.id,permission:'skip'};
  if(rank(permission)<0)throw new Error('ACTION_PERMISSION_INVALID');
  const slow=Array.isArray(context?.preferences)&&context.preferences.some(x=>x.confidence>=.7&&/tempo|pace/i.test(x.key)&&/slow|медлен/i.test(x.value));
  const pace=slow?'Без спешки,':'В своём темпе,';
  const lines={
    key:{words:'Положите рядом любой небольшой предмет как символ ключа. По очереди скажите одну фразу о том, что хотели бы открыть вместе сегодня.',embrace:'Положите рядом предмет как символ ключа. Обнимитесь на несколько спокойных вдохов и только затем вместе отложите его.',kiss:'Положите рядом предмет как символ ключа. Если обоим комфортно, обменяйтесь поцелуем, прежде чем вместе отложить его.',touch:'Положите рядом предмет как символ ключа. Возьмитесь за руки и вместе отложите его, сохраняя контакт столько, сколько приятно обоим.'},
    corridor:{words:'Встаньте рядом, как герои перед несуществующей дверью. Каждый скажет, что помогает ему чувствовать себя в безопасности рядом с другим.',embrace:'Встаньте рядом, будто перед дверью комнаты №17. Обнимитесь; один делает шаг вперёд только после отклика другого.',kiss:'Встаньте рядом, будто перед дверью комнаты №17. Остановитесь, обменяйтесь поцелуем и вместе сделайте шаг вперёд.',touch:'Встаньте рядом, будто перед дверью комнаты №17. Один протягивает руку, второй берёт её; вместе сделайте шаг вперёд.'},
    room17:{words:'Представьте запечатанный конверт на столе. По очереди произнесите по одной фразе, которую хотели бы сохранить после этой ночи.',embrace:'Представьте конверт в центре комнаты. Обнимитесь и по очереди произнесите по одной фразе, которую хочется сохранить.',kiss:'Представьте конверт в центре комнаты. Поцелуйтесь, если желание взаимно, и по очереди произнесите по одной фразе на память.',touch:'Представьте конверт в центре комнаты. Сядьте рядом, соприкоснитесь ладонями и по очереди произнесите по одной фразе на память.'}
  };
  return {title:scene.chapter,text:`${pace} ${lines[scene.id][permission]} Любой может остановить действие или предложить перейти к следующей сцене.`,scene:scene.id,permission};
}
