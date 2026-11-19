// Per-book real-player casting gate.
// Offline is fine. Unconfirmed identities and synthetic player control are not.
export function assertRealPairReady(identities={},isHumanReady=()=>false){
  for(const role of ['A','B']){
    if(!isHumanReady(identities[role]))
      throw new Error('NOVEL2_PAIR_BOTH_ACTORS_REQUIRED');
  }
  return true;
}
export function assertRealPairCast(entries=[]){
  for(const role of ['A','B']){
    const actor=entries.find(x=>x?.interactive_role===role);
    if(!actor||actor.source_type!=='player'||actor.control_mode!=='human'||!actor.identity_lock)
      throw new Error('NOVEL2_PAIR_CAST_MUST_BE_HUMAN');
  }
  return true;
}
