import pg from 'pg';
import {createNightLinearNovelStore} from '../src/night-linear-novel-store.js';
import {createNightRelationshipBridge} from '../src/integrations/relationship-context-connector.js';
const {Pool}=pg;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL_MISSING');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try{
  const store=createNightLinearNovelStore({pool});
  const status=await store.status();
  const relationship=await createNightRelationshipBridge().context();
  status.relationship_context={available:relationship.source==='relationship_context',raw_messages:relationship.raw_messages===true,observations:relationship.observations?.length||0,preferences:relationship.preferences?.length||0,dynamics:relationship.dynamics?.length||0,moments:relationship.moments?.length||0};
  console.log('NIGHT_LINEAR_NOVEL_STATUS '+JSON.stringify(status));
  if(process.argv.includes('--require-complete')&&!status.complete)process.exitCode=2;
}finally{await pool.end().catch(()=>{});}
