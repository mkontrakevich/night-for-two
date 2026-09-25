import {completeOpenRouter} from './openrouter-client.js';

export async function completeAI(options={}) {
  const started=Date.now();
  try {
    const result=await completeOpenRouter(options);
    console.log('ai_gateway',JSON.stringify({event:'success',provider:result.provider,model:result.model,requestName:String(options.requestName||'generic'),durationMs:Date.now()-started}));
    return {...result,dbContext:{contour:'standalone',sectionCount:0}};
  } catch(error) {
    console.log('ai_gateway',JSON.stringify({event:'failure',provider:'openrouter',requestName:String(options.requestName||'generic'),durationMs:Date.now()-started,code:String(error?.message||error).slice(0,160)}));
    throw error;
  }
}

export async function completeAIText(options={}) {
  return (await completeAI(options)).text;
}
