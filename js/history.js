/* ---------- History ---------- */
import { state } from './state.js';
import { escapeHtml, formatDate, showModal, showToast } from './utils.js';
import { matchesCol, doc, deleteDoc } from './firebase.js';
import { canViewData } from './auth.js';
import { pendingApprovalHtml, loadData } from './data.js';
import { enterEditMode } from './match.js';

export function playerName(id){
  const p = state.data.players.find(p => p.id === id);
  return p ? p.name : '(removed player)';
}

export function renderHistory(){
  const wrap = document.getElementById('history-list');
  if(!state.currentUser){
    wrap.innerHTML = '<div class="empty-state"><span class="display">Sign in</span>Sign in to see match history.</div>';
    return;
  }
  if(!canViewData()){
    wrap.innerHTML = pendingApprovalHtml();
    return;
  }
  if(state.data.matches.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No matches yet</span>Log your first match and it will show up here.</div>';
    return;
  }
  const sorted = [...state.data.matches].sort((a,b)=> new Date(b.date) - new Date(a.date));
  wrap.innerHTML = sorted.map(m => {
    // Aggregate goals and assists per player
    const playerStats = {};
    m.events.forEach(e => {
      if(!playerStats[e.playerId]) playerStats[e.playerId] = { goals: 0, assists: 0 };
      if(e.type === 'goal') playerStats[e.playerId].goals++;
      if(e.type === 'assist') playerStats[e.playerId].assists++;
    });

    const statsLines = Object.entries(playerStats).map(([playerId, stats]) => {
      const name = escapeHtml(playerName(playerId));
      const parts = [];
      if(stats.goals > 0) parts.push(`${stats.goals} goal${stats.goals > 1 ? 's' : ''}`);
      if(stats.assists > 0) parts.push(`${stats.assists} assist${stats.assists > 1 ? 's' : ''}`);
      return `<div style="font-size:13px; margin-bottom:4px;">${name}: ${parts.join(', ')}</div>`;
    }).join('') || '<div style="font-size:13px; color:rgba(22,24,28,0.45);">No goals or assists logged for this match.</div>';

    return `
      <div class="card match-card" data-match-toggle="${m.id}">
        <div class="mc-top">
          <div class="mc-teams">${escapeHtml(m.teamA.name)} vs ${escapeHtml(m.teamB.name)}</div>
          <div class="mc-score">${m.scoreA} – ${m.scoreB}</div>
        </div>
        <div class="mc-date">${formatDate(m.date)} · tap for details</div>
        <div class="match-detail" id="detail-${m.id}">
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">${escapeHtml(m.teamA.name)} squad</div>
          <div style="font-size:13px; margin-bottom:10px;">${m.teamA.players.map(playerName).map(escapeHtml).join(', ')}</div>
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">${escapeHtml(m.teamB.name)} squad</div>
          <div style="font-size:13px; margin-bottom:10px;">${m.teamB.players.map(playerName).map(escapeHtml).join(', ')}</div>
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">Goals &amp; assists</div>
          ${statsLines}
          ${state.isAdmin ? `
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button class="ghost" data-edit-match="${m.id}">Edit this match</button>
              <button class="ghost" data-delete-match="${m.id}">Delete this match</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

export function initHistory(){
  document.getElementById('history-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-match]');
    if(editBtn){
      e.stopPropagation();
      if(!state.isAdmin) return;
      const id = editBtn.getAttribute('data-edit-match');
      const match = state.data.matches.find(m => m.id === id);
      if(match) enterEditMode(match);
      return;
    }
    const del = e.target.closest('[data-delete-match]');
    if(del){
      e.stopPropagation();
      if(!state.isAdmin) return;
      const ok = await showModal({
        title: 'Delete match?',
        message: 'This removes the match and its goal/assist log for good. This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      });
      if(!ok) return;
      const id = del.getAttribute('data-delete-match');
      try{
        await deleteDoc(doc(matchesCol, id));
      }catch(e){
        showToast('Could not delete match: ' + e.message);
        return;
      }
      await loadData();
      return;
    }
    const card = e.target.closest('[data-match-toggle]');
    if(card){
      const id = card.getAttribute('data-match-toggle');
      document.getElementById('detail-' + id).classList.toggle('open');
    }
  });
}