/* ---------- New Match: player picking, goals/assists entry, save + edit ---------- */
import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import { avatarHtml } from './photos.js';
import { matchesCol, doc, addDoc, setDoc } from './firebase.js';
import { loadData } from './data.js';
import { switchPanel } from './nav.js';

export function renderPlayerPicks(){
  const a = document.getElementById('pickA');
  const b = document.getElementById('pickB');
  if(state.data.players.length === 0){
    a.innerHTML = '<span style="font-size:13px; color:rgba(22,24,28,0.5);">Add players in the Profile tab first</span>';
    b.innerHTML = a.innerHTML;
    return;
  }
  a.innerHTML = state.data.players.map(p => pickLabel(p, 'A')).join('');
  b.innerHTML = state.data.players.map(p => pickLabel(p, 'B')).join('');
  syncPickAvailability();
  renderGoalAssistInputs();
}
function pickLabel(p, team){
  return `<label><input type="checkbox" value="${p.id}" data-team="${team}" class="pick-cb"> ${escapeHtml(p.name)}</label>`;
}
function updatePickStyles(e){
  const label = e.target.closest('label');
  if(label) label.classList.toggle('picked', e.target.checked);
  syncPickAvailability();
  renderGoalAssistInputs();
}

/* A player picked for one team can't also be picked for the other team */
function syncPickAvailability(){
  const idsA = getPickedIds('A');
  const idsB = getPickedIds('B');
  document.querySelectorAll('#pickA .pick-cb').forEach(cb => {
    const disable = idsB.includes(cb.value);
    cb.disabled = disable;
    cb.closest('label').classList.toggle('disabled-pick', disable);
  });
  document.querySelectorAll('#pickB .pick-cb').forEach(cb => {
    const disable = idsA.includes(cb.value);
    cb.disabled = disable;
    cb.closest('label').classList.toggle('disabled-pick', disable);
  });
}

/* ---------- Per-player goals/assists totals ---------- */
function getPickedIds(team){
  return Array.from(document.querySelectorAll(`.pick-cb[data-team="${team}"]:checked`)).map(cb => cb.value);
}
function readCurrentGoalAssistValues(){
  const values = {};
  document.querySelectorAll('#event-rows .ga-row').forEach(row => {
    const pid = row.getAttribute('data-player-id');
    values[pid] = {
      goals: parseInt(row.querySelector('.ga-goals').value) || 0,
      assists: parseInt(row.querySelector('.ga-assists').value) || 0
    };
  });
  return values;
}
function renderGoalAssistInputs(){
  const wrap = document.getElementById('event-rows');
  const prev = readCurrentGoalAssistValues();
  const teamAName = document.getElementById('teamA-name').value.trim() || 'Team A';
  const teamBName = document.getElementById('teamB-name').value.trim() || 'Team B';
  const idsA = getPickedIds('A');
  const idsB = getPickedIds('B');

  if(idsA.length === 0 && idsB.length === 0){
    wrap.innerHTML = '<div style="font-size:13px; color:rgba(22,24,28,0.45); padding:6px 0;">Pick players for Team A / Team B above to enter their goals and assists.</div>';
    return;
  }

  function rowsFor(ids, teamLabel){
    return state.data.players.filter(p => ids.includes(p.id)).map(p => {
      const prevVal = prev[p.id] || { goals: 0, assists: 0 };
      return `
        <div class="ga-row" data-player-id="${p.id}">
          <div class="ga-name">${avatarHtml(p, 26)}<span>${escapeHtml(p.name)}</span><span class="ga-team-tag">${escapeHtml(teamLabel)}</span></div>
          <div class="ga-fields">
            <label>Goals<input type="number" min="0" class="ga-goals" value="${prevVal.goals}"></label>
            <label>Assists<input type="number" min="0" class="ga-assists" value="${prevVal.assists}"></label>
          </div>
        </div>
      `;
    }).join('');
  }

  wrap.innerHTML = rowsFor(idsA, teamAName) + rowsFor(idsB, teamBName);
}

export function resetMatchForm(){
  document.getElementById('teamA-name').value = 'Team A';
  document.getElementById('teamB-name').value = 'Team B';
  document.getElementById('scoreA').value = 0;
  document.getElementById('scoreB').value = 0;
  document.getElementById('match-date').valueAsDate = new Date();
  document.querySelectorAll('.pick-cb').forEach(cb => { cb.checked = false; cb.closest('label').classList.remove('picked'); });
  syncPickAvailability();
  renderGoalAssistInputs();
}

/* ---------- Editing an existing match (admin only) ---------- */
export function enterEditMode(match){
  if(!state.isAdmin) return;
  state.editingMatchId = match.id;

  document.getElementById('match-date').value = match.date;
  document.getElementById('teamA-name').value = match.teamA.name;
  document.getElementById('teamB-name').value = match.teamB.name;
  document.getElementById('scoreA').value = match.scoreA;
  document.getElementById('scoreB').value = match.scoreB;

  document.querySelectorAll('.pick-cb').forEach(cb => {
    const onThisTeam = cb.getAttribute('data-team') === 'A'
      ? match.teamA.players.includes(cb.value)
      : match.teamB.players.includes(cb.value);
    cb.checked = onThisTeam;
    cb.closest('label').classList.toggle('picked', onThisTeam);
  });
  syncPickAvailability();
  renderGoalAssistInputs();

  const counts = {};
  match.events.forEach(ev => {
    if(!counts[ev.playerId]) counts[ev.playerId] = { goals: 0, assists: 0 };
    if(ev.type === 'goal') counts[ev.playerId].goals++;
    if(ev.type === 'assist') counts[ev.playerId].assists++;
  });
  document.querySelectorAll('#event-rows .ga-row').forEach(row => {
    const pid = row.getAttribute('data-player-id');
    const c = counts[pid] || { goals: 0, assists: 0 };
    row.querySelector('.ga-goals').value = c.goals;
    row.querySelector('.ga-assists').value = c.assists;
  });

  document.getElementById('save-match-btn').textContent = 'Update match';
  document.getElementById('edit-banner').style.display = 'flex';
  switchPanel('newmatch');
  showToast('Editing match — make your changes and tap Update match');
}

export function exitEditMode(){
  state.editingMatchId = null;
  document.getElementById('save-match-btn').textContent = 'Save match';
  document.getElementById('edit-banner').style.display = 'none';
}

export function initMatch(){
  document.getElementById('pickA').addEventListener('change', updatePickStyles);
  document.getElementById('pickB').addEventListener('change', updatePickStyles);

  ['teamA-name','teamB-name'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderGoalAssistInputs);
  });

  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    exitEditMode();
    resetMatchForm();
    switchPanel('history');
  });

  document.getElementById('save-match-btn').addEventListener('click', async () => {
    if(!state.isAdmin){ showToast('Admin only'); return; }
    const teamAName = document.getElementById('teamA-name').value.trim() || 'Team A';
    const teamBName = document.getElementById('teamB-name').value.trim() || 'Team B';
    const idsA = getPickedIds('A');
    const idsB = getPickedIds('B');
    if(idsA.length === 0 || idsB.length === 0){
      showToast('Pick at least one player for each team'); return;
    }
    const scoreA = parseInt(document.getElementById('scoreA').value) || 0;
    const scoreB = parseInt(document.getElementById('scoreB').value) || 0;
    const date = document.getElementById('match-date').value || new Date().toISOString().slice(0,10);

    // Validate player goals match team goals
    let teamAGoals = 0, teamBGoals = 0;
    let teamAAssists = 0, teamBAssists = 0;
    document.querySelectorAll('#event-rows .ga-row').forEach(row => {
      const playerId = row.getAttribute('data-player-id');
      const goals = parseInt(row.querySelector('.ga-goals').value) || 0;
      const assists = parseInt(row.querySelector('.ga-assists').value) || 0;
      if(idsA.includes(playerId)){
        teamAGoals += goals;
        teamAAssists += assists;
      } else {
        teamBGoals += goals;
        teamBAssists += assists;
      }
    });

    if(teamAGoals !== scoreA){
      showToast(`Team A player goals (${teamAGoals}) must match team score (${scoreA})`);
      return;
    }
    if(teamBGoals !== scoreB){
      showToast(`Team B player goals (${teamBGoals}) must match team score (${scoreB})`);
      return;
    }
    if(teamAAssists > teamAGoals){
      showToast(`Team A assists (${teamAAssists}) cannot exceed goals (${teamAGoals})`);
      return;
    }
    if(teamBAssists > teamBGoals){
      showToast(`Team B assists (${teamBAssists}) cannot exceed goals (${teamBGoals})`);
      return;
    }

    const events = [];
    document.querySelectorAll('#event-rows .ga-row').forEach(row => {
      const playerId = row.getAttribute('data-player-id');
      const team = idsA.includes(playerId) ? 'A' : 'B';
      const goals = parseInt(row.querySelector('.ga-goals').value) || 0;
      const assists = parseInt(row.querySelector('.ga-assists').value) || 0;
      for(let i = 0; i < goals; i++) events.push({ team, playerId, type: 'goal' });
      for(let i = 0; i < assists; i++) events.push({ team, playerId, type: 'assist' });
    });

    const isEditing = !!state.editingMatchId;
    // Preserve any existing votes/MVP data when an admin edits a match -
    // correcting a score typo shouldn't wipe out an in-progress or already
    // decided MVP poll. New matches start with an empty, open poll.
    const existing = isEditing ? state.data.matches.find(m => m.id === state.editingMatchId) : null;
    const match = {
      date,
      teamA: { name: teamAName, players: idsA },
      teamB: { name: teamBName, players: idsB },
      scoreA, scoreB,
      events,
      votes: (existing && existing.votes) || {},
      pollClosed: existing ? !!existing.pollClosed : false,
      mvpPlayerId: existing ? (existing.mvpPlayerId || null) : null,
      // The `date` field is just a day (no time), so two matches logged on
      // the same day are indistinguishable by date alone - createdAt is
      // what actually lets "most recent" mean "most recently logged" and
      // not just an arbitrary Firestore read order. Preserved on edits so
      // editing an old match doesn't make it act newer than it is.
      createdAt: existing ? (existing.createdAt || Date.now()) : Date.now()
    };

    try{
      if(isEditing){
        await setDoc(doc(matchesCol, state.editingMatchId), match);
      }else{
        await addDoc(matchesCol, match);
      }
    }catch(e){
      showToast('Could not save match: ' + e.message);
      return;
    }

    exitEditMode();
    resetMatchForm();
    await loadData();
    showToast(isEditing ? 'Match updated' : 'Match saved');
    switchPanel('history');
  });
}