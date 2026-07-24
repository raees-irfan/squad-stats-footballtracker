/* ---------- Scoreboard (latest match summary) ---------- */
import { state } from './state.js';
import { escapeHtml, formatDate } from './utils.js';
import { avatarHtml } from './photos.js';
import { computeOverall } from './ratings.js';
import { POSITION_META } from './constants.js';

function nameOf(id){
  const p = state.data.players.find(p => p.id === id);
  return p ? p.name : '(removed player)';
}

function goalsAssistsInMatch(match, playerId){
  let goals = 0, assists = 0;
  match.events.forEach(ev => {
    if(ev.playerId !== playerId) return;
    if(ev.type === 'goal') goals++;
    if(ev.type === 'assist') assists++;
  });
  return { goals, assists };
}

function mvpMiniCardHtml(match){
  const player = state.data.players.find(p => p.id === match.mvpPlayerId);
  if(!player) return '';
  const { goals, assists } = goalsAssistsInMatch(match, player.id);
  const overall = computeOverall(player);
  const pr = player.profile || {};
  const posMeta = pr.position ? POSITION_META[pr.position] : null;

  return `
    <div style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.28); border:1px solid var(--amber); border-radius:8px; padding:8px 12px; margin-top:10px; text-align:left;">
      ${avatarHtml(player, 40)}
      <div style="flex:1; min-width:0;">
        <div style="font-size:10px; color:var(--amber); font-weight:700; letter-spacing:0.04em;">🏆 MATCH MVP</div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:17px; color:#fff; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(player.name)}</div>
        ${pr.nickname ? `<div style="font-size:11px; color:rgba(233,238,242,0.55); font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">"${escapeHtml(pr.nickname)}"</div>` : ''}
      </div>
      ${posMeta ? `<span style="font-family:'Space Mono',monospace; font-size:10px; font-weight:700; color:#fff; background:${posMeta.color}; padding:2px 6px; border-radius:4px;">${posMeta.label}</span>` : ''}
      <div style="text-align:center; flex-shrink:0;">
        <div style="font-family:'Space Mono',monospace; font-size:16px; font-weight:700; color:var(--amber); line-height:1;">${overall}</div>
        <div style="font-size:9px; color:rgba(233,238,242,0.5);">OVR</div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <div style="text-align:center;">
          <div style="font-family:'Space Mono',monospace; font-size:14px; font-weight:700; color:#fff; line-height:1;">${goals}</div>
          <div style="font-size:9px; color:rgba(233,238,242,0.5);">G</div>
        </div>
        <div style="text-align:center;">
          <div style="font-family:'Space Mono',monospace; font-size:14px; font-weight:700; color:#fff; line-height:1;">${assists}</div>
          <div style="font-size:9px; color:rgba(233,238,242,0.5);">A</div>
        </div>
      </div>
    </div>
  `;
}

export function renderScoreboard(){
  const el = document.getElementById('scoreboard');
  if(state.data.matches.length === 0){
    el.className = 'scoreboard empty';
    el.textContent = 'Log your first match to see it here';
    return;
  }
  const m = [...state.data.matches].sort((a,b)=> (new Date(b.date) - new Date(a.date)) || ((b.createdAt||0) - (a.createdAt||0)))[0];
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
  dateEl.style.width='100%'; dateEl.style.flexBasis='100%'; dateEl.style.textAlign='center'; dateEl.style.marginTop='8px';
  dateEl.textContent = formatDate(m.date);
  el.appendChild(dateEl);

  if(m.pollClosed && m.mvpPlayerId){
    const mvpWrap = document.createElement('div');
    mvpWrap.style.width = '100%';
    mvpWrap.style.flexBasis = '100%';
    mvpWrap.innerHTML = mvpMiniCardHtml(m);
    el.appendChild(mvpWrap);
  }
}