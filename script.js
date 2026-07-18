import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* Your Firebase project's web config (Project settings > your app).
   This is not a secret - it identifies the project, not a credential.
   Real access control is enforced by firestore.rules. */
const firebaseConfig = {
  apiKey: "AIzaSyAyhzLOKkX2ZZJQbLdcNr4Y8xTf15My6EI",
  authDomain: "matchday-bbdf3.firebaseapp.com",
  projectId: "matchday-bbdf3",
  storageBucket: "matchday-bbdf3.firebasestorage.app",
  messagingSenderId: "833275024370",
  appId: "1:833275024370:web:c7a1216ecfeb2d8889916b"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const playersCol = collection(db, 'players');
const matchesCol = collection(db, 'matches');
const usersCol = collection(db, 'users');
const feedbackCol = collection(db, 'feedback');

let data = { players: [], matches: [] };
let currentUser = null; // { uid, email, displayName, role }
let isAdmin = false;
let photoUploadTargetId = null;

/* ---------- Points ---------- */
const POINTS = {
  GOAL: 5,
  ASSIST: 3
};

/* ---------- Hardcoded player photos ----------
   Optional: if you'd rather hardcode photos in code instead of (or alongside)
   uploading them via Admin settings, add entries here.
   Key = player name EXACTLY as it appears in the Squad tab (it's stored in CAPS).
   Value = any image URL, or a base64 data URL.
   Uploaded photos (saved via Admin) always take priority over this map.
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
    return `<img src="${escapeHtml(photo)}" alt="${escapeHtml(player.name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;">`;
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
  if(!isAdmin){ showToast('Admin only'); return; }
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
    await updateDoc(doc(playersCol, player.id), { photo: dataUrl });
    await loadData();
    showToast('Photo updated for ' + player.name);
  }catch(err){
    showToast(err.message || 'Could not update photo');
  }finally{
    photoUploadTargetId = null;
  }
});

/* ---------- Custom modal (replaces prompt/confirm) ---------- */
function showModal({ title = '', message = '', showInput = false, inputType = 'text', useTextarea = false, confirmText = 'OK', cancelText = 'Cancel' } = {}){
  return new Promise((resolve) => {
    const overlay = document.getElementById('app-modal');
    const input = document.getElementById('modal-input');
    const textarea = document.getElementById('modal-textarea');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    input.style.display = (showInput && !useTextarea) ? 'block' : 'none';
    textarea.style.display = (showInput && useTextarea) ? 'block' : 'none';
    input.type = inputType;
    input.value = '';
    textarea.value = '';
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    overlay.classList.add('show');
    if(showInput) setTimeout(() => (useTextarea ? textarea : input).focus(), 50);

    function cleanup(result){
      overlay.classList.remove('show');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onConfirm(){ cleanup(showInput ? (useTextarea ? textarea.value.trim() : input.value) : true); }
    function onCancel(){ cleanup(showInput ? null : false); }
    function onKeydown(e){ if(e.key === 'Enter' && !useTextarea){ e.preventDefault(); onConfirm(); } }
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

/* ---------- Auth ---------- */
document.getElementById('auth-signup-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if(!email || !password){ showToast('Enter email and password'); return; }
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(usersCol, cred.user.uid), {
      email, displayName: email.split('@')[0], role: 'user', approved: false
    });
    showToast('Account created — an admin needs to approve you before you can see squad data.');
  }catch(e){
    showToast(e.message || 'Sign up failed');
  }
});

document.getElementById('auth-signin-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if(!email || !password){ showToast('Enter email and password'); return; }
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(e){
    showToast(e.message || 'Sign in failed');
  }
});

document.getElementById('auth-signout-btn').addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if(user){
    let role = 'user', displayName = user.email, approved = false;
    try{
      const snap = await getDoc(doc(usersCol, user.uid));
      if(snap.exists()){
        role = snap.data().role || 'user';
        displayName = snap.data().displayName || user.email;
        approved = !!snap.data().approved;
      }
    }catch(e){ /* fall back to defaults above */ }
    currentUser = { uid: user.uid, email: user.email, displayName, role, approved };
    isAdmin = role === 'admin';
    document.getElementById('auth-signed-out').style.display = 'none';
    document.getElementById('auth-signed-in').style.display = 'flex';
    document.getElementById('auth-user-label').textContent = `${displayName} (${isAdmin ? 'admin' : approved ? 'user' : 'pending approval'})`;
    document.getElementById('feedback-btn').style.display = isAdmin ? 'none' : 'inline-block';
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    await loadData();
  }else{
    currentUser = null;
    isAdmin = false;
    document.getElementById('auth-signed-out').style.display = 'flex';
    document.getElementById('auth-signed-in').style.display = 'none';
    data = { players: [], matches: [] };
    renderAll();
  }
  updateAdminUI();
});

function canViewData(){
  return isAdmin || (currentUser && currentUser.approved);
}

function updateAdminUI(){
  document.getElementById('admin-settings').style.display = isAdmin ? 'block' : 'none';
  if(isAdmin) refreshAdminPanels();
  updateNavVisibility();
  renderSquad();
  renderHistory();
  renderPlayerStats();
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

/* ---------- Feedback (users -> admins) ---------- */
document.getElementById('feedback-btn').addEventListener('click', async () => {
  if(!currentUser) return;
  const msg = await showModal({
    title: 'Send feedback',
    message: "Tell the admin what you noticed — corrections, missing stats, anything.",
    showInput: true,
    useTextarea: true,
    confirmText: 'Send'
  });
  if(!msg) return;
  try{
    await addDoc(feedbackCol, {
      authorUid: currentUser.uid,
      authorLabel: currentUser.displayName,
      message: msg,
      createdAt: Date.now(),
      status: 'open'
    });
    showToast('Feedback sent');
  }catch(e){
    showToast('Could not send feedback: ' + e.message);
  }
});

async function refreshAdminPanels(){
  await Promise.all([renderAdminUsers(), renderAdminFeedback()]);
}

async function renderAdminUsers(){
  const wrap = document.getElementById('admin-users-list');
  try{
    const snap = await getDocs(usersCol);
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(users.length === 0){ wrap.innerHTML = '<div style="font-size:12px; color:rgba(22,24,28,0.5);">No signed-up users yet.</div>'; return; }
    wrap.innerHTML = users.map(u => {
      const status = u.role === 'admin' ? 'admin' : (u.approved ? 'user' : 'pending approval');
      let actionBtn = '';
      if(status === 'pending approval') actionBtn = `<button class="secondary" data-approve-user="${u.id}" style="width:auto;">Approve</button>`;
      else if(status === 'user') actionBtn = `<button class="secondary" data-promote-user="${u.id}" style="width:auto;">Promote to admin</button>`;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px;">
          <span>${escapeHtml(u.displayName || u.email)} <span style="font-family:'Space Mono',monospace; font-size:10px; color:rgba(22,24,28,0.5);">(${escapeHtml(status)})</span></span>
          ${actionBtn}
        </div>
      `;
    }).join('');
  }catch(e){
    wrap.innerHTML = `<div style="font-size:12px; color:rgba(22,24,28,0.5);">Could not load users: ${escapeHtml(e.message)}</div>`;
  }
}
document.getElementById('admin-users-list').addEventListener('click', async (e) => {
  if(!isAdmin) return;
  const approveBtn = e.target.closest('[data-approve-user]');
  if(approveBtn){
    const uid = approveBtn.getAttribute('data-approve-user');
    try{
      await updateDoc(doc(usersCol, uid), { approved: true });
      showToast('User approved');
      await renderAdminUsers();
    }catch(e){
      showToast('Could not approve user: ' + e.message);
    }
    return;
  }
  const promoteBtn = e.target.closest('[data-promote-user]');
  if(promoteBtn){
    const uid = promoteBtn.getAttribute('data-promote-user');
    try{
      await updateDoc(doc(usersCol, uid), { role: 'admin', approved: true });
      showToast('User promoted to admin');
      await renderAdminUsers();
    }catch(e){
      showToast('Could not promote user: ' + e.message);
    }
    return;
  }
});

async function renderAdminFeedback(){
  const wrap = document.getElementById('admin-feedback-list');
  try{
    const snap = await getDocs(feedbackCol);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.status !== 'resolved');
    if(items.length === 0){ wrap.innerHTML = '<div style="font-size:12px; color:rgba(22,24,28,0.5);">No open feedback.</div>'; return; }
    wrap.innerHTML = items.map(f => `
      <div style="padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;">
        <div style="font-size:11px; color:rgba(22,24,28,0.5); margin-bottom:2px;">${escapeHtml(f.authorLabel || 'someone')}</div>
        <div style="margin-bottom:6px;">${escapeHtml(f.message)}</div>
        <button class="secondary" data-resolve-feedback="${f.id}" style="width:auto;">Mark resolved</button>
      </div>
    `).join('');
  }catch(e){
    wrap.innerHTML = `<div style="font-size:12px; color:rgba(22,24,28,0.5);">Could not load feedback: ${escapeHtml(e.message)}</div>`;
  }
}
document.getElementById('admin-feedback-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-resolve-feedback]');
  if(!btn || !isAdmin) return;
  const id = btn.getAttribute('data-resolve-feedback');
  try{
    await updateDoc(doc(feedbackCol, id), { status: 'resolved' });
    await renderAdminFeedback();
  }catch(e){
    showToast('Could not update feedback: ' + e.message);
  }
});

/* ---------- Data (Firestore) ---------- */
async function loadData(){
  if(!canViewData()){
    // Not approved yet - don't even attempt the read, Firestore rules
    // would reject it anyway and it's not an error worth surfacing.
    data = { players: [], matches: [] };
    renderAll();
    return;
  }
  try{
    const [playersSnap, matchesSnap] = await Promise.all([getDocs(playersCol), getDocs(matchesCol)]);
    data.players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }catch(e){
    showToast('Could not load data: ' + e.message);
    data = { players: [], matches: [] };
  }
  renderAll();
}

function pendingApprovalHtml(){
  return '<div class="empty-state"><span class="display">Pending approval</span>An admin needs to approve your account before you can see squad data. You can still send feedback in the meantime.</div>';
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
  if(!currentUser){
    list.innerHTML = '<div class="empty-state" style="width:100%;">Sign in to see the squad.</div>';
    return;
  }
  if(!canViewData()){
    list.innerHTML = pendingApprovalHtml();
    return;
  }
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
  if(!isAdmin){ showToast('Admin only'); return; }
  const input = document.getElementById('new-player-name');
  const name = input.value.trim().toUpperCase();
  if(!name){ showToast('Enter a name first'); return; }
  if(data.players.some(p => p.name === name)){
    showToast('That player already exists'); return;
  }

  const position = document.getElementById('new-player-position').value;
  if(!position){ showToast('Pick a position first'); return; }

  const jerseyRaw = document.getElementById('new-player-jersey').value;
  const ageRaw = document.getElementById('new-player-age').value;
  const heightRaw = document.getElementById('new-player-height').value;

  const player = {
    name,
    profile: {
      position,
      jerseyNumber: jerseyRaw !== '' ? parseInt(jerseyRaw) : null,
      age: ageRaw !== '' ? parseInt(ageRaw) : null,
      height: heightRaw !== '' ? parseInt(heightRaw) : null,
      favouriteTeam: document.getElementById('new-player-team').value.trim(),
      preferredFoot: document.getElementById('new-player-foot').value,
      nickname: document.getElementById('new-player-nickname').value.trim(),
      bio: document.getElementById('new-player-bio').value.trim(),
      submitted: true
    }
  };

  try{
    await addDoc(playersCol, player);
  }catch(e){
    showToast('Could not add player: ' + e.message);
    return;
  }

  input.value = '';
  document.getElementById('new-player-position').value = '';
  document.getElementById('new-player-jersey').value = '';
  document.getElementById('new-player-age').value = '';
  document.getElementById('new-player-height').value = '';
  document.getElementById('new-player-team').value = '';
  document.getElementById('new-player-foot').value = '';
  document.getElementById('new-player-nickname').value = '';
  document.getElementById('new-player-bio').value = '';

  await loadData();
  showToast('Player added');
});

document.getElementById('squad-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove-player]');
  if(!btn) return;
  if(!isAdmin){ showToast('Admin only'); return; }
  const id = btn.getAttribute('data-remove-player');
  const ok = await showModal({
    title: 'Remove player?',
    message: 'Their past match stats stay in history, but they will drop off pick lists for new matches.',
    confirmText: 'Remove',
    cancelText: 'Cancel'
  });
  if(!ok) return;
  try{
    await deleteDoc(doc(playersCol, id));
  }catch(e){
    showToast('Could not remove player: ' + e.message);
    return;
  }
  await loadData();
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

/* ---------- New Match: per-player goals/assists totals ---------- */
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
  if(!isAdmin){ showToast('Admin only'); return; }
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
    date,
    teamA: { name: teamAName, players: idsA },
    teamB: { name: teamBName, players: idsB },
    scoreA, scoreB,
    events
  };

  try{
    if(isEditing){
      await setDoc(doc(matchesCol, editingMatchId), match);
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
  if(!currentUser){
    wrap.innerHTML = '<div class="empty-state"><span class="display">Sign in</span>Sign in to see match history.</div>';
    return;
  }
  if(!canViewData()){
    wrap.innerHTML = pendingApprovalHtml();
    return;
  }
  if(data.matches.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No matches yet</span>Log your first match and it will show up here.</div>';
    return;
  }
  const sorted = [...data.matches].sort((a,b)=> new Date(b.date) - new Date(a.date));
  wrap.innerHTML = sorted.map(m => {
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
    if(!isAdmin) return;
    const id = editBtn.getAttribute('data-edit-match');
    const match = data.matches.find(m => m.id === id);
    if(match) enterEditMode(match);
    return;
  }
  const del = e.target.closest('[data-delete-match]');
  if(del){
    e.stopPropagation();
    if(!isAdmin) return;
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

/* ---------- Shared stat computation: goals and assists only ---------- */
function computePlayerStats(){
  const stats = {};
  data.players.forEach(p => { stats[p.id] = { id: p.id, name: p.name, goals: 0, assists: 0, matches: 0, points: 0 }; });

  data.matches.forEach(m => {
    [...m.teamA.players, ...m.teamB.players].forEach(pid => {
      if(stats[pid]) stats[pid].matches++;
    });
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
  if(!currentUser){
    wrap.innerHTML = '<div class="empty-state"><span class="display">Sign in</span>Sign in to see the leaderboard.</div>';
    return;
  }
  if(!canViewData()){
    wrap.innerHTML = pendingApprovalHtml();
    return;
  }
  if(data.players.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No players yet</span>Add players in the Squad tab to start tracking stats.</div>';
    return;
  }
  if(data.matches.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No matches logged</span>Stats will appear once you log a match.</div>';
    return;
  }
  const stats = computePlayerStats();
  const rows = Object.values(stats).sort((a,b) => b.points - a.points || (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals);
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
      Points: goal = ${POINTS.GOAL} · assist = ${POINTS.ASSIST}
    </div>
  `;
}

/* ---------- Player profiles ---------- */
const POSITION_META = {
  GK:  { label: 'GK',  full: 'Goalkeeper', color: 'var(--amber)' },
  DEF: { label: 'DEF', full: 'Defender',   color: 'var(--turf)' },
  MID: { label: 'MID', full: 'Midfielder', color: 'var(--pitch-dark)' },
  FWD: { label: 'FWD', full: 'Forward',    color: 'var(--red)' }
};

/* Which player's card is expanded, and which player's profile form (if any)
   is currently open, in the Player Stats panel. */
let expandedPlayerId = null;
let profileEditPlayerId = null;

function profileFormHtml(player){
  const pr = player.profile || {};
  return `
    <div class="profile-form" data-player-id="${player.id}">
      <div class="row2">
        <div>
          <label>Position</label>
          <select class="pf-position">
            <option value="">Select…</option>
            <option value="GK" ${pr.position === 'GK' ? 'selected' : ''}>Goalkeeper</option>
            <option value="DEF" ${pr.position === 'DEF' ? 'selected' : ''}>Defender</option>
            <option value="MID" ${pr.position === 'MID' ? 'selected' : ''}>Midfielder</option>
            <option value="FWD" ${pr.position === 'FWD' ? 'selected' : ''}>Forward</option>
          </select>
        </div>
        <div>
          <label>Jersey number</label>
          <input type="number" min="0" max="99" class="pf-jersey" value="${pr.jerseyNumber ?? ''}">
        </div>
      </div>
      <div class="row2">
        <div><label>Age</label><input type="number" min="0" class="pf-age" value="${pr.age ?? ''}"></div>
        <div><label>Height (cm)</label><input type="number" min="0" class="pf-height" value="${pr.height ?? ''}"></div>
      </div>
      <div class="row2">
        <div><label>Favourite team</label><input type="text" class="pf-team" value="${escapeHtml(pr.favouriteTeam || '')}"></div>
        <div>
          <label>Preferred foot</label>
          <select class="pf-foot">
            <option value="">Select…</option>
            <option value="Left" ${pr.preferredFoot === 'Left' ? 'selected' : ''}>Left</option>
            <option value="Right" ${pr.preferredFoot === 'Right' ? 'selected' : ''}>Right</option>
            <option value="Both" ${pr.preferredFoot === 'Both' ? 'selected' : ''}>Both</option>
          </select>
        </div>
      </div>
      <label>Nickname</label>
      <input type="text" class="pf-nickname" maxlength="24" value="${escapeHtml(pr.nickname || '')}">
      <label>Bio / catchphrase</label>
      <input type="text" class="pf-bio" maxlength="80" placeholder="e.g. Never tracks back" value="${escapeHtml(pr.bio || '')}">
      <div style="display:flex; gap:8px; margin-top:4px;">
        <button type="button" class="primary pf-save" style="width:auto; flex:1;">Save card</button>
        <button type="button" class="secondary pf-cancel" style="width:auto;">Cancel</button>
      </div>
    </div>
  `;
}

function fplCardHtml(r, player){
  const pr = player.profile;
  const posMeta = POSITION_META[pr.position] || { label: '—', color: 'var(--ink)' };
  const footerBits = [
    pr.favouriteTeam ? `<div>⚽ ${escapeHtml(pr.favouriteTeam)}</div>` : '',
    pr.preferredFoot ? `<div>🦶 ${escapeHtml(pr.preferredFoot)}</div>` : '',
    pr.age ? `<div>🎂 ${escapeHtml(String(pr.age))}</div>` : '',
    pr.height ? `<div>📏 ${escapeHtml(String(pr.height))}cm</div>` : ''
  ].join('');
  return `
    <div class="fpl-card">
      <div class="fpl-card-top" style="background:${posMeta.color};">
        <span>${posMeta.label}</span>
        <span class="fpl-overall">${r.points} PTS</span>
      </div>
      <div class="fpl-photo-wrap">
        ${pr.jerseyNumber != null && pr.jerseyNumber !== '' ? `<span class="fpl-jersey-ghost">${escapeHtml(String(pr.jerseyNumber))}</span>` : ''}
        ${avatarHtml(player, 84)}
      </div>
      <div class="fpl-name">${escapeHtml(player.name)}</div>
      ${pr.nickname ? `<div class="fpl-nickname">"${escapeHtml(pr.nickname)}"</div>` : ''}
      <div class="fpl-secondary-stats">
        <div><span>${r.goals}</span>Goals</div>
        <div><span>${r.assists}</span>Assists</div>
        <div><span>${r.matches}</span>MP</div>
        <div><span>${r.points}</span>Pts</div>
      </div>
      ${footerBits ? `<div class="fpl-footer">${footerBits}</div>` : ''}
      ${pr.bio ? `<div class="fpl-bio">“${escapeHtml(pr.bio)}”</div>` : ''}
      ${isAdmin ? `<button type="button" class="ghost" data-edit-profile="${player.id}" style="margin-top:8px;">Edit profile</button>` : ''}
    </div>
  `;
}

function expandedCardHtml(r, player){
  if(profileEditPlayerId === player.id){
    return profileFormHtml(player);
  }
  if(player.profile && player.profile.submitted){
    return fplCardHtml(r, player);
  }
  return `
    <div class="profile-empty">
      <p>This card hasn't been set up yet.</p>
      <button type="button" class="secondary" data-setup-profile="${player.id}">Set up card</button>
    </div>
  `;
}

async function handleProfileSave(formEl){
  if(!formEl) return;
  const playerId = formEl.getAttribute('data-player-id');
  const player = data.players.find(p => p.id === playerId);
  if(!player) return;

  const wasSubmitted = !!(player.profile && player.profile.submitted);
  if(wasSubmitted && !isAdmin){
    showToast('Only admin can edit an existing card');
    return;
  }

  const position = formEl.querySelector('.pf-position').value;
  if(!position){ showToast('Pick a position first'); return; }

  const jerseyRaw = formEl.querySelector('.pf-jersey').value;
  const ageRaw = formEl.querySelector('.pf-age').value;
  const heightRaw = formEl.querySelector('.pf-height').value;

  const profile = {
    position,
    jerseyNumber: jerseyRaw !== '' ? parseInt(jerseyRaw) : null,
    age: ageRaw !== '' ? parseInt(ageRaw) : null,
    height: heightRaw !== '' ? parseInt(heightRaw) : null,
    favouriteTeam: formEl.querySelector('.pf-team').value.trim(),
    preferredFoot: formEl.querySelector('.pf-foot').value,
    nickname: formEl.querySelector('.pf-nickname').value.trim(),
    bio: formEl.querySelector('.pf-bio').value.trim(),
    submitted: true
  };

  try{
    await updateDoc(doc(playersCol, playerId), { profile });
  }catch(e){
    showToast('Could not save card: ' + e.message);
    return;
  }

  profileEditPlayerId = null;
  await loadData();
  showToast(wasSubmitted ? 'Profile updated' : 'Card set up!');
}

/* ---------- Player Stats: compact list -> tap to expand into card ---------- */
function renderPlayerStats(){
  const wrap = document.getElementById('playerstats-content');
  if(!currentUser){
    wrap.innerHTML = '<div class="empty-state"><span class="display">Sign in</span>Sign in to see player stats.</div>';
    return;
  }
  if(!canViewData()){
    wrap.innerHTML = pendingApprovalHtml();
    return;
  }
  if(data.players.length === 0){
    wrap.innerHTML = '<div class="empty-state"><span class="display">No players yet</span>Add players in the Squad tab to start tracking stats.</div>';
    return;
  }
  const stats = computePlayerStats();

  const rows = Object.values(stats)
    .map(r => ({ r, player: data.players.find(p => p.id === r.id) || { id: r.id, name: r.name } }))
    .sort((a, b) => b.r.points - a.r.points || a.r.name.localeCompare(b.r.name));

  wrap.innerHTML = rows.map(({ r, player }) => {
    const expanded = expandedPlayerId === r.id;
    const posMeta = player.profile && player.profile.position ? POSITION_META[player.profile.position] : null;
    const posBadge = posMeta
      ? `<span class="pos-badge" style="background:${posMeta.color};">${posMeta.label}</span>`
      : `<span class="pos-badge pos-badge--empty">SET UP</span>`;

    return `
      <div class="card player-row" data-player-toggle="${r.id}">
        <div class="player-row-top">
          <span ${isAdmin ? `data-photo-player="${r.id}" title="Tap to change photo" style="cursor:pointer; display:inline-flex;"` : 'style="display:inline-flex;"'}>${avatarHtml(player, 40)}</span>
          <div class="player-row-mid">
            <div class="player-row-name">${escapeHtml(r.name)}</div>
            ${posBadge}
          </div>
          <div class="player-row-stats">
            <div class="ovr-block"><span>${r.points}</span>PTS</div>
            <div><span>${r.goals}</span>G</div>
            <div><span>${r.assists}</span>A</div>
            <div><span>${r.matches}</span>MP</div>
          </div>
        </div>
        ${expanded ? expandedCardHtml(r, player) : ''}
      </div>
    `;
  }).join('');
}

document.getElementById('playerstats-content').addEventListener('click', (e) => {
  const avatarBtn = e.target.closest('[data-photo-player]');
  if(avatarBtn){
    triggerPhotoUpload(avatarBtn.getAttribute('data-photo-player'));
    return;
  }
  const setupBtn = e.target.closest('[data-setup-profile]');
  if(setupBtn){
    e.stopPropagation();
    profileEditPlayerId = setupBtn.getAttribute('data-setup-profile');
    renderPlayerStats();
    return;
  }
  const editBtn = e.target.closest('[data-edit-profile]');
  if(editBtn){
    e.stopPropagation();
    if(!isAdmin) return;
    profileEditPlayerId = editBtn.getAttribute('data-edit-profile');
    renderPlayerStats();
    return;
  }
  const cancelBtn = e.target.closest('.pf-cancel');
  if(cancelBtn){
    e.stopPropagation();
    profileEditPlayerId = null;
    renderPlayerStats();
    return;
  }
  const saveBtn = e.target.closest('.pf-save');
  if(saveBtn){
    e.stopPropagation();
    handleProfileSave(saveBtn.closest('.profile-form'));
    return;
  }
  if(e.target.closest('.profile-form')) return; // don't toggle while interacting with form fields

  const toggleRow = e.target.closest('[data-player-toggle]');
  if(toggleRow){
    const id = toggleRow.getAttribute('data-player-toggle');
    expandedPlayerId = expandedPlayerId === id ? null : id;
    renderPlayerStats();
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
renderAll();
