const EMPTY=Object.freeze({
  source:'relationship_context',
  policy:'sanitized_aggregate_v1',
  raw_messages:false,
  observations:[],
  preferences:[],
  dynamics:[],
  moments:[]
});

function clean(v='',n=500){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function clamp(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
const MOMENT_KINDS=new Set(['care','plan','shared_activity','ritual','support','humor','everyday','milestone','place','interest']);
const BLOCKED_TEXT=/\b(?:sex|sexual|erotic|fetish|fantas|nude|bdsm|intimac|consent|boundary|diagnos|toxic|narciss|trauma|medic|health|finance|salary|politic|religion)\b|секс|эрот|фетиш|фантази|интим|согласи(?:е|я|ю|ем|и)|границ|диагноз|токсич|нарцисс|травм|здоров|медицин|финанс|зарплат|политик|религи/iu;
function sanitize(input={}){
  if(input?.raw_messages===true) throw new Error('RELATIONSHIP_CONTEXT_RAW_MESSAGES_FORBIDDEN');
  return {
    source:'relationship_context',
    policy:clean(input.policy||'sanitized_aggregate_v1',80),
    raw_messages:false,
    observations:(Array.isArray(input.observations)?input.observations:[]).slice(0,24).map(x=>({
      subject:['owner','partner','couple'].includes(String(x.subject))?String(x.subject):'couple',
      category:clean(x.category,80),
      observation:clean(x.observation,420),
      status:clean(x.status,32),
      confidence:clamp(x.confidence),
      evidence_count:Math.max(0,Number(x.evidence_count)||0)
    })),
    preferences:(Array.isArray(input.preferences)?input.preferences:[]).slice(0,18).map(x=>({
      subject:['owner','partner','couple'].includes(String(x.subject))?String(x.subject):'couple',
      key:clean(x.key||x.preference_key,120),
      value:clean(x.value||x.preference_value,320),
      status:clean(x.status,32),
      confidence:clamp(x.confidence)
    })),
    dynamics:(Array.isArray(input.dynamics)?input.dynamics:[]).slice(0,12).map(x=>({
      key:clean(x.key||x.dynamic_key,120),
      description:clean(x.description,420),
      status:clean(x.status,32),
      confidence:clamp(x.confidence),
      evidence_count:Math.max(0,Number(x.evidence_count)||0)
    })),
    moments:(Array.isArray(input.moments)?input.moments:[]).slice(0,24).map(x=>({
      day:/^\d{4}-\d{2}-\d{2}$/.test(String(x.day||''))?String(x.day):'',
      kind:MOMENT_KINDS.has(String(x.kind))?String(x.kind):'everyday',
      summary:clean(x.summary,420),
      confidence:clamp(x.confidence),
      relationship_relevance:clamp(x.relationship_relevance),
      emotional_signal:clamp(x.emotional_signal),
      narrative_weight:clamp(x.narrative_weight),
      story_score:clamp(x.story_score)
    })).filter(x=>x.summary&&x.confidence>=.70&&!BLOCKED_TEXT.test(x.summary))
  };
}
async function request(path='',options={}){
  const base=String(process.env.RELATIONSHIP_CONTEXT_URL||'').replace(/\/$/,'');
  if(!base) return null;
  const token=String(process.env.RELATIONSHIP_CONTEXT_TOKEN||'').trim();
  if(!token) throw new Error('RELATIONSHIP_CONTEXT_TOKEN_REQUIRED');
  const response=await fetch(base+path,{...options,headers:{'content-type':'application/json',authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(8_000)});
  if(!response.ok) throw new Error(`RELATIONSHIP_CONTEXT_HTTP_${response.status}`);
  return response.json();
}

export function createNightRelationshipBridge(){
  async function context(){
    const payload=await request('').catch(()=>null);
    return payload?sanitize(payload):{...EMPTY};
  }
  async function recordSessionOutcome({sessionId,reactions=[]}={}){
    const values=(Array.isArray(reactions)?reactions:[]).map(String).slice(0,2);
    if(values.length<2) return {skipped:'waiting_for_both'};
    const payload=await request('/outcomes',{method:'POST',body:JSON.stringify({source:'night_for_two',session_id:Number(sessionId)||0,reactions:values})}).catch(()=>null);
    return payload||{skipped:'connector_unavailable'};
  }
  return {context,recordSessionOutcome};
}
export {sanitize as sanitizeRelationshipContext};
