/* ---------- Player ownership ----------
   A player is "owned by" the signed-in user if EITHER:
   - the player doc's ID equals their own uid (self-service creation - the
     ID *is* the uid, so this is structural, no extra field needed), OR
   - the player doc's ownerUid field equals their uid (an admin manually
     linked an existing, admin-created player record to their account).
   This single definition is shared by MVP-vote eligibility, "edit my
   profile" permission, and "change my own photo" permission - all three
   should always agree on who owns what. */
import { state } from './state.js';

export function getMyOwnedPlayerId(){
  if(!state.currentUser) return null;
  const uid = state.currentUser.uid;
  const direct = state.data.players.find(p => p.id === uid);
  if(direct) return direct.id;
  const linked = state.data.players.find(p => p.ownerUid === uid);
  return linked ? linked.id : null;
}

export function isMyPlayer(player){
  if(!player || !state.currentUser) return false;
  const uid = state.currentUser.uid;
  return player.id === uid || player.ownerUid === uid;
}
