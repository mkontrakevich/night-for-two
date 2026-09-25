import pg from 'pg';
import {createNightLinearNovelStore} from '../src/night-linear-novel-store.js';
const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
  const store=createNightLinearNovelStore({pool});
  const status=await store.status();
  console.log('NIGHT_LINEAR_NOVEL_STATUS '+JSON.stringify(status));
  if(process.argv.includes('--require-complete')&&!status.complete)process.exitCode=2;
}finally{await pool.end().catch(()=>{});}
