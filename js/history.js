/* ---------- History ---------- */
import { state } from './state.js';
import { escapeHtml, formatDate, showModal, showToast } from './utils.js';
import { matchesCol, doc, deleteDoc } from './firebase.js';
import { canViewData } from './auth.js';
import { pendingApprovalHtml, loadData } from './data.js';
import { enterEditMode } from './match.js';
import { mvpSectionHtml, initMvpVoting } from './mvp.js';

export function playerName(id){
  const p = state.data.players.find(p => p.id === id);
  return p ? p.name : '(removed player)';
}

/* Repeats an emoji once per count, up to a cap - past that it switches to
   a compact "emoji ×N" form so a big match doesn't overflow the card. */
function emojiBadges(emoji, count){
  if(count <= 0) return '';
  const CAP = 6;
  if(count <= CAP){
    return Array(count).fill(emoji).join(' ');
  }
  return `${emoji} ×${count}`;
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
  const sorted = [...state.data.matches].sort((a,b)=> (new Date(b.date) - new Date(a.date)) || ((b.createdAt||0) - (a.createdAt||0)));
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
      const goalBadges = emojiBadges('⚽', stats.goals);
      const assistBadges = emojiBadges('🅰️', stats.assists);
      const sep = (goalBadges && assistBadges) ? '<span style="color:rgba(22,24,28,0.35); margin:0 6px;">|</span>' : '';
      return `<div style="font-size:13px; margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><span>${name}:</span><span style="font-size:15px; line-height:1;">${goalBadges}${sep}${assistBadges}</span></div>`;
    }).join('') || '<div style="font-size:13px; color:rgba(22,24,28,0.45);">No goals or assists logged for this match.</div>';

    return `
      <div class="card match-card" data-match-toggle="${m.id}">
        <div class="mc-top">
          <div class="mc-teams">${escapeHtml(m.teamA.name)} vs ${escapeHtml(m.teamB.name)}</div>
          <div class="mc-score">${m.scoreA} – ${m.scoreB}</div>
        </div>
        <div class="mc-date">${formatDate(m.date)} · tap for details</div>
        ${(m.pollClosed && m.mvpPlayerId) ? `<div style="font-size:12px; font-weight:600; color:#0F2A38; background:var(--amber); display:inline-block; padding:2px 10px; border-radius:10px; margin-top:6px;">🏆 Match MVP: ${escapeHtml(playerName(m.mvpPlayerId))}</div>` : ''}
        <div class="match-detail" id="detail-${m.id}">
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">${escapeHtml(m.teamA.name)} squad</div>
          <div style="font-size:13px; margin-bottom:10px;">${m.teamA.players.map(playerName).map(escapeHtml).join(', ')}</div>
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">${escapeHtml(m.teamB.name)} squad</div>
          <div style="font-size:13px; margin-bottom:10px;">${m.teamB.players.map(playerName).map(escapeHtml).join(', ')}</div>
          <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">Goals &amp; assists</div>
          ${statsLines}
          ${mvpSectionHtml(m)}
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
  const historyList = document.getElementById('history-list');
  initMvpVoting(historyList);
  historyList.addEventListener('click', async (e) => {
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