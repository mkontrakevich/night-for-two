// Shared publication gates. Provider success alone is not a usable result.
export const MIN_SCENE_CHARACTERS=4200;

export function assertExpectedTurn(book,input){
  if(!book||String(input?.book_id)!==String(book.id)||!Number.isSafeInteger(input?.turn_no)||input.turn_no!==Number(book.turn_no))throw new Error('NOVEL2_PIPELINE_STALE_TURN');
}

export function assertSceneArtifact(scene){
  if(!scene||typeof scene!=='object'||typeof scene.prose!=='string')throw new Error('NOVEL2_PIPELINE_SCENE_INVALID');
  if(scene.prose.trim().length<MIN_SCENE_CHARACTERS)throw new Error('NOVEL2_PIPELINE_SCENE_TOO_SHORT');
  if(!['A','B'].includes(scene.target_role))throw new Error('NOVEL2_PIPELINE_TARGET_INVALID');
  if(typeof scene.primary_interaction?.prompt!=='string'||!scene.primary_interaction.prompt.trim())throw new Error('NOVEL2_PIPELINE_PROMPT_MISSING');
  return scene;
}

export function assertBookArtifact(bible){
  if(typeof bible?.title!=='string'||!bible.title.trim())throw new Error('NOVEL2_PIPELINE_TITLE_MISSING');
  assertSceneArtifact(bible.first_scene);
  return bible;
}
