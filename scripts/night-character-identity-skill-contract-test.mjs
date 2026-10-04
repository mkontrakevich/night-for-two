import fs from 'node:fs';
import assert from 'node:assert/strict';

const identity=fs.readFileSync(new URL('../skills/real-couple-character-identity/SKILL.md',import.meta.url),'utf8');
const sd=fs.readFileSync(new URL('../skills/sd-story-illustration/SKILL.md',import.meta.url),'utf8');

for(const marker of [
  'REAL PLAYER REFERENCES',
  'VISUAL IDENTITY PROFILE',
  'FICTION ROLE OVERLAY',
  'IMMUTABLE IDENTITY LOCK',
  'SCENE-SPECIFIC APPEARANCE STATE',
  'PAIR LOCK',
  'Calibration before production',
  'FACE_DRIFT',
  'IDENTITY_SWAP',
  'HEIGHT_DRIFT',
  'CONTINUITY_BREAK',
  'raw_messages=false'
])assert(identity.includes(marker),`Character identity skill missing contract marker: ${marker}`);

const order=[
  'SHOT TYPE',
  'STORY / ACTION',
  'BODY LANGUAGE / SUBJECT SCALE',
  'EMOTION / ATMOSPHERE',
  'WARDROBE / PROPS / TEXTURES',
  'ENVIRONMENT',
  'LIGHT / TIME',
  'CAMERA / LENS',
  'COLOR / FILM CHARACTER',
  'IDENTITY LOCK',
  'CONTINUITY LOCK'
];
let last=-1;
for(const marker of order){
  const idx=identity.indexOf(marker);
  assert(idx>last,`Prompt order broken at ${marker}`);
  last=idx;
}

assert(sd.includes('skills/real-couple-character-identity/SKILL.md'),'SD skill must depend on the canonical real-couple character identity skill');
assert(sd.includes('immutable IDENTITY LOCK'),'SD skill must preserve immutable character identity');
assert(identity.includes('must not independently reinvent a player\'s appearance'),'Character identity must be canonical');
assert(identity.includes('Do not infer or encode sensitive personal attributes'),'Character skill must prohibit sensitive-trait inference');
assert(identity.includes('Do not silently mutate the canonical identity'),'Canonical identity must require explicit versioning');

console.log('NIGHT_CHARACTER_IDENTITY_SKILL_OK canonical=true pair_lock=true privacy=true prompt_order=true continuous_qa=true');
