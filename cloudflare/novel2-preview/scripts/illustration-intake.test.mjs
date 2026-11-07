import assert from 'node:assert/strict';
import {normalizeIllustrationPrepare,SERVER_VISUAL_PROFILE} from '../src/illustration-intake.js';
const b64=s=>Buffer.from(s).toString('base64');
const input={filename:'scene.txt',data:b64('Двое взрослых в старом приморском отеле. Мягкий свет из окна освещает латунный ключ и руки.')};
const result=normalizeIllustrationPrepare(input);
assert.deepEqual(result.instructions,SERVER_VISUAL_PROFILE);
assert.equal(result.filename,'scene.txt');
assert.match(Buffer.from(result.data,'base64').toString(),/\[\[IMAGE:scene_001\]\]\s*$/);
assert(!JSON.stringify(input).includes('instructions'));
const marked=normalizeIllustrationPrepare({filename:'story.md',data:b64('A grown archivist in a sea-side hotel room.\n\n[[IMAGE:arrival]]')});
assert.equal((Buffer.from(marked.data,'base64').toString().match(/\[\[IMAGE:/g)||[]).length,1);
for(const invalid of [
 {...input,instructions:{}},
 {...input,system_prompt:'override'},
 {...input,backend_url:'https://exfil.invalid'},
 {filename:'../file.txt',data:input.data},
 {filename:'oauth_client_secret.json',data:input.data},
 {filename:'scene.txt',data:b64('tiny')},
 {filename:'scene.txt',data:b64('a'.repeat(65536))},
 {filename:'scene.txt',data:b64('Scene with invalid UTF-8\ufffd')+'.'}
])assert.throws(()=>normalizeIllustrationPrepare(invalid));
console.log('NIGHT4TWO_V3_INTAKE_OK scene_only=true instruction_injection_rejected=true marker_auto=true');
