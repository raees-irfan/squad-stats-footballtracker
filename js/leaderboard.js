/* ---------- Leaderboard ---------- */
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { canViewData } from './auth.js';
import { pendingApprovalHtml } from './data.js';
import { computePlayerStats } from './stats.js';
import { avatarHtml } from './photos.js';
import { POINTS } from './constants.js';

function breakdownHtml(breakdown){
  const parts = [
    breakdown.goals > 0 ? `⚽ Goals: ${breakdown.goals} pts` : null,
    breakdown.assists > 0 ? `🅰️ Assists: ${breakdown.assists} pts` : null,
    breakdown.win > 0 ? `🏆 Team win: ${breakdown.win} pts` : null,
    breakdown.mvp > 0 ? `🏅 Match MVP: ${breakdown.mvp} pts` : null,
    breakdown.bestDefender > 0 ? `🥉 Best defender: ${breakdown.bestDefender} pts` : null
  ].filter(Boolean);
  if(parts.length === 0){
    return '<div style="font-size:12px; color:rgba(22,24,28,0.5);">No points yet.</div>';
  }
  return `<div style="font-size:12px; color:rgba(22,24,28,0.7); line-height:1.7;">${parts.join(' · ')}</div>`;
}

export function renderLeaderboard(){
  const wrap = document.getElementById('leaderboard-content');
  if(!state.currentUser){
    wrap.innerHTML = '<div class="empty-state"><span class="display">Sign in</span>Sign in to see the leaderboard.</div>';
    return;
  }
  if(!canViewData()){
    wrap.innerHTML = pendingApprovalHtml();
    return;
  }
  if(state.data.players.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No players yet</span>Add players in the Profile tab to start tracking stats.</div>';
    return;
  }
  if(state.data.matches.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No matches logged</span>Stats will appear once you log a match.</div>';
    return;
  }
  const stats = computePlayerStats();
  const rows = Object.values(stats).sort((a,b) => b.points - a.points || (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals || b.matches - a.matches);
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th class="num">MP</th>
          <th class="num">G</th>
          <th class="num">A</th>
          <th class="num">G+A</th>
          <th class="num">Pts</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r,i) => {
          const player = state.data.players.find(p => p.id === r.id) || { name: r.name };
          const expanded = state.expandedLeaderboardId === r.id;
          return `
          <tr class="${i===0 && r.points > 0 ? 'rank1' : ''}" data-lb-toggle="${r.id}" style="cursor:pointer;">
            <td style="display:flex; align-items:center; gap:8px;">${avatarHtml(player, 22)}${escapeHtml(r.name)}</td>
            <td class="num">${r.matches}</td>
            <td class="num">${r.goals}</td>
            <td class="num">${r.assists}</td>
            <td class="num">${r.goals + r.assists}</td>
            <td class="num"><strong>${r.points}</strong></td>
          </tr>
          ${expanded ? `
          <tr>
            <td colspan="6" style="background:rgba(0,0,0,0.02); padding:8px 10px;">
              ${breakdownHtml(r.breakdown)}
            </td>
          </tr>
          ` : ''}
        `;}).join('')}
      </tbody>
    </table>
    <div style="font-size:11px; color:rgba(22,24,28,0.45); margin-top:8px;">
      Points: goal = ${POINTS.GOAL} · assist = ${POINTS.ASSIST} · team win = ${POINTS.WIN} · match MVP = ${POINTS.MVP} · best defender = ${POINTS.BEST_DEFENDER_1ST}/${POINTS.BEST_DEFENDER_2ND}/${POINTS.BEST_DEFENDER_3RD}
    </div>
    <div style="font-size:11px; color:rgba(22,24,28,0.4); margin-top:4px;">Tap a player to see how their points break down.</div>
  `;
}

export function initLeaderboard(){
  document.getElementById('leaderboard-content').addEventListener('click', (e) => {
    const row = e.target.closest('[data-lb-toggle]');
    if(!row) return;
    const id = row.getAttribute('data-lb-toggle');
    state.expandedLeaderboardId = state.expandedLeaderboardId === id ? null : id;
    renderLeaderboard();
  });
}