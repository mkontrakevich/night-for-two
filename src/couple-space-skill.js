import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const COUPLE_SPACE_SKILL_PATH=path.resolve(here,'../skills/couple-space/intimate-narrative/SKILL.md');

let cached='';

export function loadCoupleSpaceSkill(){
  if(cached)return cached;
  cached=fs.readFileSync(COUPLE_SPACE_SKILL_PATH,'utf8').trim();
  if(!cached.includes('COUPLE SPACE — INTIMATE NARRATIVE'))throw new Error('COUPLE_SPACE_SKILL_INVALID');
  return cached;
}

export function buildCoupleSpaceGeneratorSystemPrompt({provider='',mode='image',extra=''}={}){
  const skill=loadCoupleSpaceSkill();
  return `${skill}\n\nRUNTIME GENERATION CONTEXT\nprovider: ${provider||'auto'}\nmode: ${mode||'image'}\n${extra?`additional runtime constraints:\n${extra}`:''}`.trim();
}
