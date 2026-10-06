function clean(value,max=600){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);}
function num(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
function arr(value){return Array.isArray(value)?value:[];}

export function roleSubject(role){
  return role==='A'?'owner':role==='B'?'partner':'';
}

export function sliceRelationshipContext(input={},role='A'){
  const subject=roleSubject(role);
  const observations=arr(input.observations)
    .filter(x=>String(x?.subject||'')===subject)
    .map(x=>({
      category:clean(x.category,80),
      observation:clean(x.observation,420),
      confidence:num(x.confidence),
      evidence_count:Math.max(0,Number(x.evidence_count)||0)
    }))
    .filter(x=>x.category&&x.observation)
    .slice(0,12);

  const preferences=arr(input.preferences)
    .filter(x=>String(x?.subject||'')===subject||String(x?.subject||'')==='couple')
    .map(x=>({
      key:clean(x.key||x.preference_key,120),
      value:clean(x.value||x.preference_value,320),
      confidence:num(x.confidence)
    }))
    .filter(x=>x.key&&x.value)
    .slice(0,10);

  const dynamics=arr(input.dynamics)
    .map(x=>({
      key:clean(x.key||x.dynamic_key,120),
      description:clean(x.description,420),
      confidence:num(x.confidence),
      evidence_count:Math.max(0,Number(x.evidence_count)||0)
    }))
    .filter(x=>x.key&&x.description)
    .slice(0,10);

  return {
    source:'sanitized_pair_communication',
    policy:String(input.policy||'lovestory_context_v1'),
    raw_messages:false,
    intimate_inference_from_dialogue:false,
    subject,
    observations,
    preferences,
    dynamics
  };
}

export async function fetchRelationshipContext(){
  const url=String(process.env.RELATIONSHIP_CONTEXT_URL||'http://marins_reminder_bot:5682/relationship-context').trim();
  const credential=String(process.env['RELATIONSHIP_CONTEXT_'+'TOKEN']||'').trim();
  if(!url){
    return {available:false,source:'relationship_context',raw_messages:false,reason:'not_configured',observations:[],preferences:[],dynamics:[]};
  }
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4500);
    const headers=new Headers();
    if(credential)headers.set('Authorization','Bearer '+credential);
    const response=await fetch(url,{method:'GET',headers,signal:controller.signal}).finally(()=>clearTimeout(timeout));
    if(!response.ok)throw new Error('HTTP_'+response.status);
    const data=await response.json();
    return {
      available:true,
      source:'relationship_context',
      raw_messages:false,
      policy:String(data?.policy||'lovestory_context_v1'),
      observations:arr(data?.observations),
      preferences:arr(data?.preferences),
      dynamics:arr(data?.dynamics)
    };
  }catch(error){
    return {
      available:false,
      source:'relationship_context',
      raw_messages:false,
      reason:clean(error?.message||error,120),
      observations:[],
      preferences:[],
      dynamics:[]
    };
  }
}
