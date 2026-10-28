import {MIN_SCENE_CHARACTERS} from './pipeline-contract.js';

// Expand prose separately from scene metadata. The decision point and role
// belong to the accepted scene and cannot be changed by a length repair.
export async function expandSceneToTarget(scene,{complete,system,storyBible={},recentTurns=[],reason=''}={}){
  if(scene.prose.trim().length>=MIN_SCENE_CHARACTERS)return scene;
  const result=await complete({
    system,temperature:.6,maxTokens:7600,
    responseSchema:{type:'object',required:['paragraphs'],additionalProperties:false,properties:{
      paragraphs:{type:'array',minItems:10,maxItems:12,items:{type:'string',minLength:300}}
    }},
    user:{
      task:'Перепиши существующую сцену целиком в 10–12 содержательных абзацев. Каждый абзац — около 90–110 слов. Общий объём — минимум 900 слов. Верни только paragraphs, без метаданных и комментариев.',
      short_scene:scene,story_bible:storyBible,recent_turns:recentTurns,reason,
      hard_rules:[
        'Не сокращай исходную сцену. Сохрани её события, последовательность, участников и финальную точку выбора.',
        'Не принимай за игрока решение и не продолжай события за финальную точку выбора.',
        'Добавляй причинно связанные действия, предметные детали, диалог и развитие конфликта; не повторяй одинаковые мысли ради объёма.',
        'Сохраняй факты и границы исходной истории. Расширение текста не меняет её содержание или допустимость.',
        'Не возвращай target_role, primary_interaction, canon или карточки персонажей: они уже сохранены.'
      ]
    }
  });
  const paragraphs=result?.paragraphs;
  if(!Array.isArray(paragraphs)||paragraphs.length<10||paragraphs.length>12||paragraphs.some(p=>typeof p!=='string'||!p.trim()))throw new Error('NOVEL2_SCENE_EXPANSION_INVALID');
  const prose=paragraphs.map(p=>p.trim()).join('\n\n');
  return prose.length>scene.prose.length?{...scene,prose}:scene;
}
