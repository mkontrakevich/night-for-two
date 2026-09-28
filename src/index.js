import http from 'node:http';
import {installNightBackendGenerator} from './night-backend-generator-api.js';

const port=Math.max(1,Number(process.env.PORT)||5681);
const app=installNightBackendGenerator({port});
await app.ready;

const server=http.createServer((req,res)=>{
  res.writeHead(404,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify({ok:false,error:'NOT_FOUND'}));
});
await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,'0.0.0.0',resolve);
});
console.log(`night_for_two_ready port=${port}`);

for(const signal of ['SIGINT','SIGTERM']){
  process.on(signal,async()=>{
    try{
      await new Promise(resolve=>server.close(()=>resolve()));
      await app.close?.();
    }finally{process.exit(0);}
  });
}
