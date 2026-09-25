import {installNightForTwoMiniApp} from './night-for-two-miniapp-v3.js';

const port=Math.max(1,Number(process.env.PORT)||5681);
const app=installNightForTwoMiniApp({port});
await app.ready;
console.log(`night_for_two_ready port=${port}`);

for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,async()=>{
    try{await app.close?.();}finally{process.exit(0);}
  });
}
