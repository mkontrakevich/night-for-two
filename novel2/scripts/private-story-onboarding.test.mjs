import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
const ui=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
const a=app.indexOf('function publicStoryDraft(');
const b=app.indexOf('\nasync function driveAiTurns(',a);
assert.ok(a>=0&&b>a,'private API projection source available');
let characterReads=0;
const {publicState,publicStoryDraft}=vm.runInNewContext(app.slice(a,b)+'\n({publicState,publicStoryDraft})',{
 characterSummary:async(identity,role)=>{characterReads++;return {ready:!!identity?.approved,name:role==='A'?'My actor':'Private partner',avatar:'',character_card:{passport:{fiction_name:'Player '+role}}}},
 buildBaseActorCard:({role})=>({role,kind:'base_actor_identity'}),
 castCharacterSummary:async(entry)=>({...entry,from_cast:true}),
 pendingReply:async(bookId,turnNo,role)=>({reply:'Saved reply for '+role,action_key:''}),
 isAiControlled:()=>false
});
const blueprint={
 title:'A secret story',logline:'Private role spoilers and private names',
 genre_tone:'psychological mystery',cast_slots:[
  {slot_key:'lead_a',interactive:true,narrative_function:'Investigator'},
  {slot_key:'lead_b',interactive:true,narrative_function:'Secret beloved'},
  {slot_key:'villain',interactive:false,narrative_function:'Secret antagonist'}
 ],world_bible:{private_cast:'secret'},ending_direction:'Final plot twist'
};
const draft=publicStoryDraft({id:11,title:blueprint.title,logline:blueprint.logline,blueprint,status:'draft'});
assert.equal(draft.id,11);
assert.equal(draft.title,'A secret story');
assert.equal(draft.logline,'');
assert.equal(draft.blueprint.logline,'');
assert.deepEqual(Object.keys(draft.blueprint).sort(),['genre_tone','logline','title']);
assert.doesNotMatch(JSON.stringify(draft),/Investigator|Secret beloved|Secret antagonist|private_cast|ending_direction/);
const cast=[
 {interactive_role:'A',display_name:'My actor'},
 {interactive_role:'B',display_name:'Private partner',reference_images:['PRIVATE_PHOTO']},
 {interactive_role:null,display_name:'Secret antagonist',character_card:{passport:{fiction_name:'Secret antagonist'}}}
];
for(const own of ['A','B']){
 const ids={A:{approved:true,profile:{},reference_images:['own.jpg']},B:{approved:true,profile:{},reference_images:['private.jpg']}};
 const state=await publicState({id:7,title:'A secret story',chapter_no:2,turn_no:3,active_role:own,
  current_scene:{prose:'Scene opens.',noir_progress:{partner_reveal_phase:'fictional_reveal'}}},
  {role:own},ids,cast);
 assert.equal(Object.keys(state.characters).length,1);
 assert.equal(Object.keys(state.identity).length,1);
 assert.ok(state.characters[own]);
 assert.equal(state.cast.length,1);
 assert.equal(state.pending_reply.reply,'Saved reply for '+own);
 assert.equal(state.cast[0].interactive_role,own);
 assert.equal(characterReads,own==='A'?1:2);
 const output=JSON.stringify(state);
 assert.doesNotMatch(output,/Secret antagonist/);
 if(own==='A')assert.doesNotMatch(output,/PRIVATE_PHOTO/);
 assert.doesNotMatch(output,own==='A'?/Private partner|private.jpg/:/My actor|own.jpg/);
}
const storyStart=ui.indexOf('function renderStoryDraft(){');
const storyEnd=ui.indexOf('function beginOwnCharacterForDraft(){',storyStart);
const html=ui.slice(storyStart,storyEnd);
assert.ok(storyStart>=0&&storyEnd>storyStart);
assert.doesNotMatch(html.replace(/^\s*\/\/.*$/gm,''),/cast_slots|narrative_function|desired_traits|support\.forEach|data-cast-slot|partner|gender|description|Неизвестный герой/);
assert.match(html,/Ваш актёр/);
assert.match(html,/Начать роман/);
const menu=ui.slice(ui.indexOf('function renderMainMenu(){'),ui.indexOf('async function openMainMenu(){'));
assert.doesNotMatch(menu,/strangerCard|partnerKnown|otherHuman|Неизвестный герой/);
const launch=ui.slice(ui.indexOf('async function launchStoryDraft(){'),ui.indexOf('function render(){',ui.indexOf('async function launchStoryDraft(){')));
assert.doesNotMatch(launch.replace(/^\s*\/\/.*$/gm,''),/data-cast-slot|assignments/);
const inlineStart=ui.indexOf('<script>')+8;
const inline=ui.slice(inlineStart,ui.indexOf('</script>',inlineStart));
assert.ok(inline.length>1000);
new vm.Script(inline,{filename:'novel2/public/index.html'});
const newBook=ui.slice(ui.indexOf('async function startNewBook('),ui.indexOf('async function editCharacterFromMenu('));
assert.ok(newBook.indexOf('if(!actor.ready')<newBook.indexOf("api('story/draft/new'"));
assert.match(app,/NOVEL2_CURRENT_PLAYER_CHARACTER_REQUIRED/);
console.log('NOVEL2_CAST_PRIVACY_OK story draft, state and browser only expose own actor; identity before story');
