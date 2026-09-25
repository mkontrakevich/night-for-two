const TEST_PERMISSIONS=['words','embrace','kiss','touch','massage','closer'];

export function isTestTelegramUserId(value){
  try{return BigInt(String(value||'0'))<0n;}catch{return false;}
}

function syntheticIdForSession(sessionId){
  return String(-(900000000000n+BigInt(String(sessionId))));
}

export async function hasTestPartner(engine,userId){
  const membership=await engine.activeMembership(String(userId));
  if(!membership)return false;
  const players=await engine.sessionPlayers(membership.session_id);
  return players.some(player=>isTestTelegramUserId(player.telegram_user_id));
}

export async function attachTestPartner(engine,{userId,name='Тест-партнёр'}={}){
  const membership=await engine.activeMembership(String(userId));
  if(!membership)throw new Error('NIGHT_SESSION_REQUIRED');
  const client=await engine.db.connect();
  let syntheticId='';
  try{
    await client.query('BEGIN');
    const session=(await client.query('SELECT * FROM night_sessions WHERE id=$1 FOR UPDATE',[membership.session_id])).rows[0];
    if(!session||!['waiting','active'].includes(String(session.status)))throw new Error('NIGHT_SESSION_NOT_ACTIVE');
    const players=(await client.query('SELECT * FROM night_players WHERE session_id=$1 ORDER BY role',[membership.session_id])).rows;
    const existing=players.find(player=>String(player.role)==='B');
    if(existing){
      if(!isTestTelegramUserId(existing.telegram_user_id))throw new Error('NIGHT_ROOM_FULL');
      syntheticId=String(existing.telegram_user_id);
      await client.query('COMMIT');
    }else{
      syntheticId=syntheticIdForSession(membership.session_id);
      const created=(await client.query(`INSERT INTO night_players(session_id,telegram_user_id,role,display_name,heat,desire_score,checkin_complete,permissions)
        VALUES($1,$2,'B',$3,1.0,55,true,$4::jsonb) RETURNING *`,[membership.session_id,syntheticId,String(name||'Тест-партнёр').slice(0,80),JSON.stringify(TEST_PERMISSIONS)])).rows[0];
      await client.query("UPDATE night_sessions SET status='active',updated_at=now() WHERE id=$1",[membership.session_id]);
      await client.query("INSERT INTO night_events(session_id,player_id,event_type,payload) VALUES($1,$2,'test_partner_joined',$3::jsonb)",[membership.session_id,created.id,JSON.stringify({synthetic:true})]).catch(()=>{});
      await client.query('COMMIT');
    }
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{client.release();}

  // Re-saving this synthetic check-in invokes the normal first-round gate.
  await engine.saveCheckin({userId:syntheticId,mood:'open',permissions:TEST_PERMISSIONS,consent:true});
  await advanceTestPartners(engine);
  return {telegram_user_id:syntheticId,synthetic:true};
}

async function accelerateTestRounds(engine){
  await engine.db.query(`UPDATE night_assignments a
    SET status='pending',available_at=now(),next_reminder_at=CASE WHEN p.telegram_user_id<0 THEN NULL ELSE now()+interval '90 minutes' END
    FROM night_players p
    WHERE p.id=a.player_id AND a.status='queued'
      AND EXISTS(SELECT 1 FROM night_players tp WHERE tp.session_id=a.session_id AND tp.telegram_user_id<0)`);
}

export async function advanceTestPartners(engine){
  let processed=0;
  for(let pass=0;pass<8;pass++){
    await accelerateTestRounds(engine);
    const {rows}=await engine.db.query(`SELECT a.id,a.session_id,r.stage,p.telegram_user_id
      FROM night_assignments a
      JOIN night_players p ON p.id=a.player_id
      JOIN night_rounds r ON r.id=a.round_id
      WHERE a.status='pending' AND p.telegram_user_id<0
      ORDER BY a.id LIMIT 20`);
    if(!rows.length)break;
    for(const row of rows){
      const userId=String(row.telegram_user_id);
      try{
        await engine.completeAssignment({userId,assignmentId:row.id});
        await engine.addFeedback({userId,assignmentId:row.id,direction:'up'});
        processed++;
      }catch(error){
        const code=String(error?.message||'');
        if(!/NOT_ACTIVE|NOT_DONE/u.test(code))throw error;
      }
    }
  }
  return processed;
}
