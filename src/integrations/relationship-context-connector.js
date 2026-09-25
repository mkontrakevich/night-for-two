const EMPTY=Object.freeze({
  source:'relationship_context',
  policy:'sanitized_aggregate_v1',
  raw_messages:false,
  observations:[],
  preferences:[],
  dynamics:[]
});

function clean(v='',n=500){return String(v||'').replace(/\s+/g,' ').trim().slice(0,n);}
function clamp(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
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
    }))
  };
}
async function request(path='',options={}){
  const base=String(process.env.RELATIONSHIP_CONTEXT_URL||'').replace(/\/$/,'');
  if(!base) return null;
  const token=String(process.env.RELATIONSHIP_CONTEXT_TOKEN||'');
  const response=await fetch(base+path,{...options,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{}),...(options.headers||{})},signal:AbortSignal.timeout(8_000)});
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
