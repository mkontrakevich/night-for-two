import crypto from 'node:crypto';
import {config} from './config.js';

const actions=new Set(['prepare','list','status','generate','retry','approve','reject','assemble','asset']);
export async function illustrationWorkbenchRequest({method,action,input,role,request=fetch}){
  if(method!=='POST')return {status:405,body:{ok:false,error:'METHOD_NOT_ALLOWED'}};
  if(!actions.has(action))return {status:404,body:{ok:false,error:'NOT_FOUND'}};
  const key=crypto.createHash('sha256').update('novel2-ai-v1:'+config.botToken).digest('hex');
  const owner=crypto.createHash('sha256').update('novel2-illustrations:'+([config.ownerId,config.partnerId].sort().join(':'))+':'+role).digest('hex');
  try{
    const response=await request('http://novel2-illustration-workbench:5691/'+action,{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key,'x-workbench-owner':owner},
      body:JSON.stringify(input),signal:AbortSignal.timeout(30000)
    });
    return {status:response.status,body:await response.json()};
  }catch{return {status:503,body:{ok:false,error:'NOVEL2_ILLUSTRATIONS_UNAVAILABLE'}};}
}
