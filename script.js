const STORAGE_KEY = 'matchday-data';
const AUTH_KEY = 'matchday-auth';
const DEFAULT_ADMIN_PASS = 'chaitudv220710';
let data = { players: [], matches: [] };
let auth = { adminPass: DEFAULT_ADMIN_PASS };
let isAdmin = false;
let photoUploadTargetId = null;

/* ---------- Points ---------- */
const POINTS = {
  GOAL: 5,
  ASSIST: 3,
  CLEAN_SHEET: 3,   // team concedes fewer than 3 goals
  WIN: 5
};
const CLEAN_SHEET_THRESHOLD = 3; // "concedes less than 3 goals"

/* ---------- Hardcoded player photos ----------
   Optional: if you'd rather hardcode photos in code instead of (or alongside)
   uploading them via Admin settings, add entries here.
   Key = player name EXACTLY as it appears in the Squad tab (it's stored in CAPS).
   Value = any image URL, or a base64 data URL.
   Uploaded photos (saved via Admin) always take priority over this map.
   Example:
   const PLAYER_PHOTOS = {
     "MESSI": "https://example.com/messi.jpg"
   };
------------------------------------------------- */
const PLAYER_PHOTOS = {};

function getPlayerPhoto(player){
  if(!player) return null;
  return player.photo || PLAYER_PHOTOS[player.name] || null;
}

function avatarHtml(player, size){
  const photo = getPlayerPhoto(player);
  const initials = escapeHtml((player.name || '?').trim().slice(0,2).toUpperCase());
  if(photo){
    return `<img src="${photo}" alt="${escapeHtml(player.name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;">`;
  }
  const fontSize = Math.round(size * 0.38);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--turf, #2f6b3c);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:${fontSize}px;font-weight:700;flex-shrink:0;">${initials}</div>`;
}

/* ---------- Photo upload (resize client-side, store as base64) ---------- */
function readAndResizeImage(file, maxDim = 200, quality = 0.75){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h){
          if(w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
        }else{
          if(h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

function triggerPhotoUpload(playerId){
  if(!isAdmin){ showToast('Unlock Admin to change photos'); return; }
  photoUploadTargetId = playerId;
  document.getElementById('photo-upload-input').click();
}

document.getElementById('photo-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file || !photoUploadTargetId) return;
  const player = data.players.find(p => p.id === photoUploadTargetId);
  if(!player) return;
  try{
    const dataUrl = await readAndResizeImage(file);
    player.photo = dataUrl;
    await saveData();
    renderSquad();
    renderPlayerStats();
    showToast('Photo updated for ' + player.name);
  }catch(err){
    showToast(err.message || 'Could not update photo');
  }finally{
    photoUploadTargetId = null;
  }
});

/* ---------- Auth ---------- */
async function loadAuth(){
  try{
    const res = await window.storage.get(AUTH_KEY, true);
    if(res && res.value){
      auth = JSON.parse(res.value);
    } else {
      await window.storage.set(AUTH_KEY, JSON.stringify(auth), true);
    }
  }catch(e){
    try{ await window.storage.set(AUTH_KEY, JSON.stringify(auth), true); }catch(e2){}
  }
}
async function saveAuth(){
  try{
    const res = await window.storage.set(AUTH_KEY, JSON.stringify(auth), true);
    if(!res){ showToast('Could not save passcode'); return; }
    showToast('Admin passcode updated');
  }catch(e){
    showToast('Save failed: ' + e.message);
  }
}
document.getElementById('admin-toggle-btn').addEventListener('click', async () => {
  if(isAdmin){
    isAdmin = false;
    updateAdminUI();
    return;
  }
  const val = await showModal({
    title: 'Admin unlock',
    message: 'Enter the admin passcode to get delete access.',
    showInput: true,
    inputType: 'password',
    confirmText: 'Unlock'
  });
  if(val === null) return;
  if(val === auth.adminPass){
    isAdmin = true;
    showToast('Admin unlocked');
  }else{
    showToast('Wrong admin passcode');
  }
  updateAdminUI();
});
function updateAdminUI(){
  const btn = document.getElementById('admin-toggle-btn');
  btn.textContent = isAdmin ? 'Admin: ON' : 'Admin unlock';
  btn.classList.toggle('on', isAdmin);
  document.getElementById('admin-settings').style.display = isAdmin ? 'block' : 'none';
  if(isAdmin){
    document.getElementById('admin-pass-input').value = auth.adminPass;
  }
  updateNavVisibility();
  renderHistory();
  renderSquad();
}
function updateNavVisibility(){
  const newMatchBtn = document.querySelector('nav button[data-panel="newmatch"]');
  newMatchBtn.style.display = isAdmin ? '' : 'none';
  if(!isAdmin){
    if(editingMatchId){ exitEditMode(); resetMatchForm(); }
    if(newMatchBtn.classList.contains('active')){
      switchPanel('squad');
    }
  }
}
document.getElementById('save-passcodes-btn').addEventListener('click', async () => {
  const ap = document.getElementById('admin-pass-input').value.trim();
  if(!ap){ showToast('Admin passcode is required'); return; }
  auth.adminPass = ap;
  await saveAuth();
});

function uid(){ return Math.random().toString(36).slice(2, 10); }

/* ---------- Custom modal (replaces prompt/confirm) ---------- */
function showModal({ title = '', message = '', showInput = false, inputType = 'text', confirmText = 'OK', cancelText = 'Cancel' } = {}){
  return new Promise((resolve) => {
    const overlay = document.getElementById('app-modal');
    const input = document.getElementById('modal-input');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    input.style.display = showInput ? 'block' : 'none';
    input.type = inputType;
    input.value = '';
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    overlay.classList.add('show');
    if(showInput) setTimeout(() => input.focus(), 50);

    function cleanup(result){
      overlay.classList.remove('show');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onConfirm(){ cleanup(showInput ? input.value : true); }
    function onCancel(){ cleanup(showInput ? null : false); }
    function onKeydown(e){ if(e.key === 'Enter'){ e.preventDefault(); onConfirm(); } }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

async function loadData(){
  try{
    const res = await window.storage.get(STORAGE_KEY, true);
    if(res && res.value){
      data = JSON.parse(res.value);
      if(!data.players) data.players = [];
      if(!data.matches) data.matches = [];
    }
  }catch(e){
    // no data yet, keep defaults
    data = { players: [], matches: [] };
  }
  renderAll();
}

async function saveData(){
  try{
    const res = await window.storage.set(STORAGE_KEY, JSON.stringify(data), true);
    if(!res){ showToast('Could not save — try again'); }
  }catch(e){
    showToast('Save failed: ' + e.message);
  }
}

function renderAll(){
  renderScoreboard();
  renderSquad();
  renderPlayerPicks();
  renderHistory();
  renderLeaderboard();
  renderPlayerStats();
}

/* ---------- Scoreboard ---------- */
function renderScoreboard(){
  const el = document.getElementById('scoreboard');
  if(data.matches.length === 0){
    el.className = 'scoreboard empty';
    el.textContent = 'Log your first match to see it here';
    return;
  }
  const m = [...data.matches].sort((a,b)=> new Date(b.date) - new Date(a.date))[0];
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

/* ---------- Squad ---------- */
function renderSquad(){
  const list = document.getElementById('squad-list');
  if(data.players.length === 0){
    list.innerHTML = '<div class="empty-state" style="width:100%;">No players yet. Add your first squad member above.</div>';
    return;
  }
  list.innerHTML = data.players.map(p => `
    <div class="chip" style="display:inline-flex; align-items:center; gap:8px;">
      <span ${isAdmin ? `data-photo-player="${p.id}" title="Tap to change photo" style="cursor:pointer; display:inline-flex;"` : 'style="display:inline-flex;"'}>${avatarHtml(p, 26)}</span>
      ${escapeHtml(p.name)}
      ${isAdmin ? `<button data-remove-player="${p.id}" title="Remove player">×</button>` : ''}
    </div>
  `).join('');
}

document.getElementById('squad-list').addEventListener('click', (e) => {
  const avatarBtn = e.target.closest('[data-photo-player]');
  if(avatarBtn){
    triggerPhotoUpload(avatarBtn.getAttribute('data-photo-player'));
  }
});

document.getElementById('new-player-name').addEventListener('input', (e) => {
  const pos = e.target.selectionStart;
  e.target.value = e.target.value.toUpperCase();
  e.target.setSelectionRange(pos, pos);
});
document.getElementById('add-player-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-player-name');
  const name = input.value.trim().toUpperCase();
  if(!name){ showToast('Enter a name first'); return; }
  if(data.players.some(p => p.name === name)){
    showToast('That player already exists'); return;
  }
  data.players.push({ id: uid(), name });
  input.value = '';
  renderSquad();
  renderPlayerPicks();
  renderLeaderboard();
  renderPlayerStats();
  await saveData();
  showToast('Player added');
});

document.getElementById('squad-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove-player]');
  if(!btn) return;
  const id = btn.getAttribute('data-remove-player');
  const ok = await showModal({
    title: 'Remove player?',
    message: 'Their past match stats stay in history, but they will drop off pick lists for new matches.',
    confirmText: 'Remove',
    cancelText: 'Cancel'
  });
  if(!ok) return;
  data.players = data.players.filter(p => p.id !== id);
  renderSquad();
  renderPlayerPicks();
  renderLeaderboard();
  renderPlayerStats();
  await saveData();
});

/* ---------- New Match: player picking ---------- */
function renderPlayerPicks(){
  const a = document.getElementById('pickA');
  const b = document.getElementById('pickB');
  if(data.players.length === 0){
    a.innerHTML = '<span style="font-size:13px; color:rgba(22,24,28,0.5);">Add players in the Squad tab first</span>';
    b.innerHTML = a.innerHTML;
    return;
  }
  a.innerHTML = data.players.map(p => pickLabel(p, 'A')).join('');
  b.innerHTML = data.players.map(p => pickLabel(p, 'B')).join('');
  syncPickAvailability();
  renderGoalAssistInputs();
}
function pickLabel(p, team){
  return `<label><input type="checkbox" value="${p.id}" data-team="${team}" class="pick-cb"> ${escapeHtml(p.name)}</label>`;
}
document.getElementById('pickA').addEventListener('change', updatePickStyles);
document.getElementById('pickB').addEventListener('change', updatePickStyles);
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

/* ---------- New Match: per-player goals/assists totals ----------
   Keeps existing values (via data-player-id) when re-rendered, e.g. when
   another checkbox is toggled or a team name changes. ---------- */
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
    return data.players.filter(p => ids.includes(p.id)).map(p => {
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
['teamA-name','teamB-name'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderGoalAssistInputs);
});

function resetMatchForm(){
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
let editingMatchId = null;

function enterEditMode(match){
  if(!isAdmin) return;
  editingMatchId = match.id;

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

function exitEditMode(){
  editingMatchId = null;
  document.getElementById('save-match-btn').textContent = 'Save match';
  document.getElementById('edit-banner').style.display = 'none';
}

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
  exitEditMode();
  resetMatchForm();
  switchPanel('history');
});

document.getElementById('save-match-btn').addEventListener('click', async () => {
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

  const isEditing = !!editingMatchId;
  const match = {
    id: isEditing ? editingMatchId : uid(),
    date,
    teamA: { name: teamAName, players: idsA },
    teamB: { name: teamBName, players: idsB },
    scoreA, scoreB,
    events
  };

  if(isEditing){
    const idx = data.matches.findIndex(m => m.id === editingMatchId);
    if(idx !== -1) data.matches[idx] = match; else data.matches.push(match);
  }else{
    data.matches.push(match);
  }
  await saveData();

  exitEditMode();
  resetMatchForm();

  renderScoreboard();
  renderHistory();
  renderLeaderboard();
  renderPlayerStats();
  showToast(isEditing ? 'Match updated' : 'Match saved');
  switchPanel('history');
});

/* ---------- History ---------- */
function playerName(id){
  const p = data.players.find(p => p.id === id);
  return p ? p.name : '(removed player)';
}
function formatDate(d){
  if(!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
}
function renderHistory(){
  const wrap = document.getElementById('history-list');
  if(data.matches.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No matches yet</span>Log your first match and it will show up here.</div>';
    return;
  }
  const sorted = [...data.matches].sort((a,b)=> new Date(b.date) - new Date(a.date));
  wrap.innerHTML = sorted.map(m => {
    const goals = m.events.filter(e => e.type === 'goal');
    const assists = m.events.filter(e => e.type === 'assist');
    const evLines = m.events.map(e => `
      <div class="ev-line">
        <span class="badge ${e.type}">${e.type}</span>
        ${escapeHtml(playerName(e.playerId))}
        <span style="color:rgba(22,24,28,0.4); font-size:11px;">(${e.team === 'A' ? escapeHtml(m.teamA.name) : escapeHtml(m.teamB.name)})</span>
      </div>
    `).join('') || '<div style="font-size:13px; color:rgba(22,24,28,0.45);">No individual goals/assists logged for this match.</div>';

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
          ${evLines}
          ${isAdmin ? `
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
document.getElementById('history-list').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-match]');
  if(editBtn){
    e.stopPropagation();
    const id = editBtn.getAttribute('data-edit-match');
    const match = data.matches.find(m => m.id === id);
    if(match) enterEditMode(match);
    return;
  }
  const del = e.target.closest('[data-delete-match]');
  if(del){
    e.stopPropagation();
    const ok = await showModal({
      title: 'Delete match?',
      message: 'This removes the match and its goal/assist log for good. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if(!ok) return;
    const id = del.getAttribute('data-delete-match');
    data.matches = data.matches.filter(m => m.id !== id);
    await saveData();
    renderScoreboard(); renderHistory(); renderLeaderboard(); renderPlayerStats();
    return;
  }
  const card = e.target.closest('[data-match-toggle]');
  if(card){
    const id = card.getAttribute('data-match-toggle');
    document.getElementById('detail-' + id).classList.toggle('open');
  }
});

/* ---------- Shared stat computation ---------- */
function computePlayerStats(){
  const stats = {};
  data.players.forEach(p => { stats[p.id] = { id: p.id, name: p.name, goals: 0, assists: 0, matches: 0, points: 0 }; });

  function applyTeamResult(ids, scoredFor, scoredAgainst){
    const won = scoredFor > scoredAgainst;
    const cleanish = scoredAgainst < CLEAN_SHEET_THRESHOLD;
    ids.forEach(pid => {
      if(!stats[pid]) return;
      stats[pid].matches++;
      if(won) stats[pid].points += POINTS.WIN;
      if(cleanish) stats[pid].points += POINTS.CLEAN_SHEET;
    });
  }

  data.matches.forEach(m => {
    applyTeamResult(m.teamA.players, m.scoreA, m.scoreB);
    applyTeamResult(m.teamB.players, m.scoreB, m.scoreA);
    m.events.forEach(ev => {
      if(!stats[ev.playerId]) return;
      if(ev.type === 'goal'){ stats[ev.playerId].goals++; stats[ev.playerId].points += POINTS.GOAL; }
      if(ev.type === 'assist'){ stats[ev.playerId].assists++; stats[ev.playerId].points += POINTS.ASSIST; }
    });
  });
  return stats;
}

/* ---------- Leaderboard ---------- */
function renderLeaderboard(){
  const wrap = document.getElementById('leaderboard-content');
  if(data.players.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No players yet</span>Add players in the Squad tab to start tracking stats.</div>';
    return;
  }
  const stats = computePlayerStats();
  const rows = Object.values(stats).sort((a,b) => b.points - a.points || (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals);
  if(data.matches.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No matches logged</span>Stats will appear once you log a match.</div>';
    return;
  }
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
          const player = data.players.find(p => p.id === r.id) || { name: r.name };
          return `
          <tr class="${i===0 && r.points > 0 ? 'rank1' : ''}">
            <td style="display:flex; align-items:center; gap:8px;">${avatarHtml(player, 22)}${escapeHtml(r.name)}</td>
            <td class="num">${r.matches}</td>
            <td class="num">${r.goals}</td>
            <td class="num">${r.assists}</td>
            <td class="num">${r.goals + r.assists}</td>
            <td class="num"><strong>${r.points}</strong></td>
          </tr>
        `;}).join('')}
      </tbody>
    </table>
    <div style="font-size:11px; color:rgba(22,24,28,0.45); margin-top:8px;">
      Points: goal = ${POINTS.GOAL} · assist = ${POINTS.ASSIST} · team concedes under ${CLEAN_SHEET_THRESHOLD} = +${POINTS.CLEAN_SHEET} each · win = +${POINTS.WIN} each (bonuses stack)
    </div>
  `;
}

/* ---------- Player Stats sheet (one card per player, A-Z) ---------- */
function renderPlayerStats(){
  const wrap = document.getElementById('playerstats-content');
  if(data.players.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No players yet</span>Add players in the Squad tab to start tracking stats.</div>';
    return;
  }
  const stats = computePlayerStats();
  const rows = Object.values(stats).sort((a,b) => a.name.localeCompare(b.name));
  wrap.innerHTML = rows.map(r => {
    const player = data.players.find(p => p.id === r.id) || { name: r.name };
    return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span ${isAdmin ? `data-photo-player="${r.id}" title="Tap to change photo" style="cursor:pointer; display:inline-flex;"` : 'style="display:inline-flex;"'}>${avatarHtml(player, 40)}</span>
          <div class="display" style="font-size:22px; color:var(--pitch-dark);">${escapeHtml(r.name)}</div>
        </div>
        <div style="font-family:'Space Mono',monospace; font-size:11px; color:rgba(22,24,28,0.5);">${r.matches} match${r.matches === 1 ? '' : 'es'} played</div>
      </div>
      <div style="display:flex; gap:24px; margin-top:10px; flex-wrap:wrap;">
        <div>
          <div style="font-family:'Space Mono',monospace; font-size:28px; font-weight:700; color:var(--amber);">${r.goals}</div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5);">Total goals</div>
        </div>
        <div>
          <div style="font-family:'Space Mono',monospace; font-size:28px; font-weight:700; color:var(--turf);">${r.assists}</div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5);">Total assists</div>
        </div>
        <div>
          <div style="font-family:'Space Mono',monospace; font-size:28px; font-weight:700; color:var(--ink);">${r.goals + r.assists}</div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5);">Combined</div>
        </div>
        <div>
          <div style="font-family:'Space Mono',monospace; font-size:28px; font-weight:700; color:var(--red);">${r.points}</div>
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5);">Points</div>
        </div>
      </div>
    </div>
  `;}).join('');
}

document.getElementById('playerstats-content').addEventListener('click', (e) => {
  const avatarBtn = e.target.closest('[data-photo-player]');
  if(avatarBtn){
    triggerPhotoUpload(avatarBtn.getAttribute('data-photo-player'));
  }
});

/* ---------- Nav ---------- */
function switchPanel(name){
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
}
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
});

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// init
document.getElementById('match-date').valueAsDate = new Date();
updateNavVisibility();
(async () => {
  await loadAuth();
  await loadData();
})();