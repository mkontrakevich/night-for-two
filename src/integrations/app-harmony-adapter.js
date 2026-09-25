function categories(input={}){return input.categories&&typeof input.categories==='object'?input.categories:{};}
function levelRank(v){return ({tender:0,bold:1,hot:2})[String(v)]??0;}
function duration(a='',b=''){return a&&a===b?a:(a==='quick'||b==='quick'?'quick':(a||b||'quick'));}
function resolve(a={},b={}){
  const A=categories(a),B=categories(b),matches=[];
  for(const key of new Set([...Object.keys(A),...Object.keys(B)])){
    const av=String(A[key]||''),bv=String(B[key]||'');
    if(av==='no'||bv==='no'||!av||!bv)continue;
    if(av==='yes'&&bv==='yes')matches.push({key,strength:'strong'});
    else if(['yes','maybe'].includes(av)&&['yes','maybe'].includes(bv))matches.push({key,strength:'soft'});
  }
  const rank=Math.min(levelRank(a.intensity),levelRank(b.intensity));
  return {matches,intensity:['tender','bold','hot'][rank]||'tender',duration:duration(a.duration,b.duration),needsSelector:matches.length===0};
}
export function createLoveStoryHarmonyDirector({catalog=[]}={}){
  async function rankCompromise({a={},b={}}={}){
    const r=resolve(a,b);
    if(!r.needsSelector)return {mode:'match',...r,selector:[]};
    const keys=[...new Set([...Object.keys(categories(a)),...Object.keys(categories(b))])];
    const selector=catalog.filter(x=>keys.includes(String(x.key))).slice(0,3).map(x=>({key:String(x.key),title:String(x.title||x.key),hint:'Нейтральный общий вариант без раскрытия личного выбора партнёра.'}));
    return {mode:'selector',...r,selector};
  }
  return {rankCompromise,recordResolution:async()=>null,refreshHypotheses:async()=>({skipped:'relationship_learning_owned_by_bot'})};
}
