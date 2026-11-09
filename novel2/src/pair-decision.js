// Night4two v3.2: story-dependency gate, not online presence / forced alternation.
// Real partner A and B are authenticated separately by the parent Novel2 app.
// This module is pure: no AI calls, data access, or personal user identifiers.
const ROLES=new Set(['A','B']);
export const DECISION_POLICY_VERSION='night4two-pair-async-v1';
const own=role=>ROLES.has(role)?role:'A';
const limit=(s,n=280)=>String(s||'').trim().slice(0,n);

// LLM handoffs are advisory, not authority to invent the absent player's action.
// A legitimate handoff must identify its decision owner and why their input is needed.
export function resolveNextDecision(scene={},playerRole='A'){
  const role=own(playerRole);
  const src=scene?.decision_dependency&&typeof scene.decision_dependency==='object'
    ?scene.decision_dependency:scene||{};
  const owner=String(src.decision_owner||'').trim();
  const reason=limit(src.participation_reason,320);
  const revealScope=src.reveal_scope==='private'?'private':'shared';
  const justified=reason.length>=12;
  const delegated=(owner==='both'||(ROLES.has(owner)&&owner!==role))&&justified&&src.requires_partner===true;
  const next=delegated?owner:role;
  const dependency={
    decision_owner:next,
    requires_partner:delegated,
    participation_reason:delegated?reason:'',
    reveal_scope:revealScope,
    version:DECISION_POLICY_VERSION
  };
  const proposedTarget=ROLES.has(scene?.target_role)?scene.target_role:role;
  // If a model tried to question an unassigned partner, never surface that
  // question as an actionable prompt for the current player.
  const stalePrompt=!delegated&&proposedTarget!==role;
  const interaction={
    ...(scene?.primary_interaction||{}),
    type:'free_reply',
    prompt:stalePrompt?'Что вы предпринимаете дальше?':
      (limit(scene?.primary_interaction?.prompt,500)||'Что вы предпринимаете дальше?')
  };
  return {
    ...scene,
    decision_dependency:dependency,
    target_role:next==='both'?role:next,
    primary_interaction:interaction
  };
}
export function decisionOwner(scene={}){
  const declared=scene?.decision_dependency?.decision_owner;
  if(declared==='both'||ROLES.has(declared))return declared;
  return own(scene?.target_role);
}
export function pairDecisionView(scene={},role='A',answeredRoles=[]){
  role=own(role);
  const owner=decisionOwner(scene);
  const answered=new Set(answeredRoles.filter(x=>ROLES.has(x)));
  const requiresBoth=owner==='both';
  const finished=Boolean(scene?.noir_progress?.finale);
  const myTurn=!finished&&(requiresBoth?!answered.has(role):owner===role);
  const waitingFor=finished?null:
    requiresBoth?(!answered.has(role)?null:answered.has(role==='A'?'B':'A')?'resume':'partner'):
      owner!==role?'partner':null;
  return {
    owner:requiresBoth?'both':owner,
    can_reply:myTurn,
    waiting_for:waitingFor,
    answered_by_me:answered.has(role),
    awaiting_both:requiresBoth,
    requires_partner:Boolean(scene?.decision_dependency?.requires_partner)
  };
}
export function publicDecisionPrompt(scene={},role='A',answeredRoles=[]){
  const view=pairDecisionView(scene,role,answeredRoles);
  const src=scene&&typeof scene==='object'?scene:{};
  // Never show the other player's prompt as a selectable instruction.
  if(view.can_reply)return src;
  return {...src,primary_interaction:{type:'none',prompt:''},optional_actions:[]};
}
