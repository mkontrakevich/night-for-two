import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../src/ai.js',import.meta.url),'utf8').replace(/\r\n?/g,'\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const sent=[];let broken=false;
const api=new Function('config','crypto','sharp','fetch',source+'\nreturn {jsonCompletion,textCompletion};')({edgeAiUrl:'https://fixture.test',botToken:'fixture',textModel:'fixture'},crypto,{},async(_url,options)=>{
 const body=JSON.parse(options.body);sent.push(body);
 if(broken){broken=false;return Response.json({ok:true,content:'invalid JSON'});}
 return Response.json({ok:true,content:JSON.stringify({ok:true})});
});
const schema={type:'object',required:['ok'],properties:{ok:{type:'boolean'}}};
assert.deepEqual(await api.jsonCompletion({system:'Return JSON',user:'Neutral fixture',responseSchema:schema}),{ok:true});
assert.equal(sent[0].json_mode,true);assert.deepEqual(sent[0].json_schema,schema);
broken=true;await api.jsonCompletion({system:'Return JSON',user:'Neutral fixture',responseSchema:schema});
assert.equal(sent.length,3);assert(sent.every(x=>x.json_mode===true));assert(sent.every(x=>x.json_schema.required[0]==='ok'));
await api.textCompletion({system:'Plain text',user:'Neutral fixture'});assert.equal(sent.at(-1).json_mode,false);
console.log('STRUCTURED_AI_CONTRACT_OK schema_forwarded=true repair_schema_preserved=true ordinary_text_unchanged=true');
