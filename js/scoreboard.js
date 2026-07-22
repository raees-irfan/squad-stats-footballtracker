/* ---------- Scoreboard (latest match summary) ---------- */
import { state } from './state.js';
import { escapeHtml, formatDate } from './utils.js';

export function renderScoreboard(){
  const el = document.getElementById('scoreboard');
  if(state.data.matches.length === 0){
    el.className = 'scoreboard empty';
    el.textContent = 'Log your first match to see it here';
    return;
  }
  const m = [...state.data.matches].sort((a,b)=> new Date(b.date) - new Date(a.date))[0];
  el.className = 'scoreboard';
  el.innerHTML = `
    <div class="side">
      <div class="team-name">${escapeHtml(m.teamA.name)}</div>
      <div class="score">${m.scoreA}</div>
    </div>
    <div class="sep">—</div>
    <div class="side">
      <div class="team-name">${escapeHtml(m.teamB.name)}</div>
      <div class="score">${m.scoreB}</div>
    </div>
  `;
  const dateEl = document.createElement('div');
  dateEl.className = 'date';
  dateEl.style.width='100%'; dateEl.style.textAlign='center'; dateEl.style.marginTop='8px';
  dateEl.textContent = formatDate(m.date);
  el.appendChild(dateEl);
}