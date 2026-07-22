/* ---------- Data (Firestore) load + top-level render orchestration ---------- */
import { state } from './state.js';
import { playersCol, matchesCol, getDocs } from './firebase.js';
import { showToast } from './utils.js';
import { canViewData } from './auth.js';
import { renderScoreboard } from './scoreboard.js';
import { renderSquad } from './squad.js';
import { renderPlayerPicks } from './match.js';
import { renderHistory } from './history.js';
import { renderLeaderboard } from './leaderboard.js';
import { renderPlayerStats } from './playerProfile.js';

export async function loadData(){
  if(!canViewData()){
    // Not approved yet - don't even attempt the read, Firestore rules
    // would reject it anyway and it's not an error worth surfacing.
    state.data = { players: [], matches: [] };
    renderAll();
    return;
  }
  try{
    const [playersSnap, matchesSnap] = await Promise.all([getDocs(playersCol), getDocs(matchesCol)]);
    state.data.players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.data.matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    showToast('Could not load data: ' + e.message);
    state.data = { players: [], matches: [] };
  }
  renderAll();
}

export function pendingApprovalHtml(){
  return '<div class="empty-state"><span class="display">Pending approval</span>An admin needs to approve your account before you can see squad data. You can still send feedback in the meantime.</div>';
}

export function renderAll(){
  renderScoreboard();
  renderSquad();
  renderPlayerPicks();
  renderHistory();
  renderLeaderboard();
  renderPlayerStats();
}