export async function completeOpenRouter({messages=[],model='',maxTokens=900,temperature=.25,fetcher=fetch}={}) {
  const key=process.env.OPENROUTER_API_KEY||'';
  if(!key) throw new Error('OPENROUTER_NOT_CONFIGURED');
  const selected=model||process.env.OPENROUTER_MODEL||'openai/gpt-4.1-mini';
  const response=await fetcher('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{
      authorization:`Bearer ${key}`,
      'content-type':'application/json',
      'HTTP-Referer':'https://github.com/mkontrakevich/night-for-two',
      'X-Title':'Night for Two'
    },
    body:JSON.stringify({model:selected,temperature,max_tokens:maxTokens,messages}),
    signal:AbortSignal.timeout(45_000)
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`OPENROUTER_${response.status}: ${json?.error?.message||'request failed'}`);
  const text=String(json.choices?.[0]?.message?.content||'').trim();
  if(!text) throw new Error('OPENROUTER_EMPTY_RESPONSE');
  return {text,provider:'openrouter',model:String(json.model||selected),usage:{
    inputTokens:Number(json.usage?.prompt_tokens||0),
    outputTokens:Number(json.usage?.completion_tokens||0),
    totalTokens:Number(json.usage?.total_tokens||0)
  }};
}
