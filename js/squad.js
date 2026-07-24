/* ---------- Squad / Profile tab ---------- */
import { state } from './state.js';
import { escapeHtml, showModal, showToast } from './utils.js';
import { avatarHtml, triggerPhotoUpload } from './photos.js';
import { playersCol, usersCol, doc, addDoc, deleteDoc, getDocs, updateDoc } from './firebase.js';
import { POSITION_META } from './constants.js';
import { loadData, pendingApprovalHtml } from './data.js';
import { canViewData } from './auth.js';
import {
  myProfileFormHtml, myProfilePromptHtml, profileFormHtml,
  handleMyProfileCreate, handleProfileSave
} from './playerProfile.js';

export function myProfileSquadSectionHtml(){
  const myPlayer = state.data.players.find(p => p.id === state.currentUser.uid);

  if(!myPlayer){
    return state.creatingMyProfile ? myProfileFormHtml() : myProfilePromptHtml();
  }
  if(state.profileEditPlayerId === myPlayer.id){
    return `<div class="card"><label style="color:var(--pitch-dark);">Edit your profile</label>${profileFormHtml(myPlayer)}</div>`;
  }
  const pr = myPlayer.profile || {};
  const posMeta = pr.position ? POSITION_META[pr.position] : null;
  const posBadge = posMeta
    ? `<span class="pos-badge" style="background:${posMeta.color};">${posMeta.label}</span>`
    : `<span class="pos-badge pos-badge--empty">SET UP</span>`;
  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(myPlayer, 40)}
          <div>
            <div class="display" style="font-size:20px; color:var(--pitch-dark); line-height:1;">${escapeHtml(myPlayer.name)}</div>
            <div style="margin-top:4px;">${posBadge}</div>
          </div>
        </div>
        <button type="button" class="secondary" data-edit-profile="${myPlayer.id}" style="width:auto;">Edit my profile</button>
      </div>
    </div>
  `;
}

export function renderSquad(){
  const titleEl = document.getElementById('squad-panel-title');
  const adminCard = document.getElementById('admin-add-player-card');
  const myProfileWrap = document.getElementById('squad-my-profile-section');
  const listHeader = document.getElementById('squad-list-header');
  const list = document.getElementById('squad-list');

  titleEl.textContent = 'Profile';

  if(!state.currentUser){
    adminCard.style.display = 'none';
    myProfileWrap.innerHTML = '';
    listHeader.style.display = 'none';
    list.innerHTML = '<div class="empty-state" style="width:100%;">Sign in to see the squad.</div>';
    return;
  }
  if(!canViewData()){
    adminCard.style.display = 'none';
    myProfileWrap.innerHTML = '';
    listHeader.style.display = 'none';
    list.innerHTML = pendingApprovalHtml();
    return;
  }

  if(state.isAdmin){
    adminCard.style.display = '';
    myProfileWrap.innerHTML = '';
    listHeader.style.display = 'flex';
  }else{
    adminCard.style.display = 'none';
    myProfileWrap.innerHTML = myProfileSquadSectionHtml();
    listHeader.style.display = 'none';
  }

  if(state.data.players.length === 0){
    list.innerHTML = `<div class="empty-state" style="width:100%;">No players yet.${state.isAdmin ? ' Add your first squad member above.' : ''}</div>`;
    return;
  }
  const canManagePlayers = state.isAdmin && state.showManagePlayers;
  list.innerHTML = state.data.players.map(p => `
    <div class="chip" style="display:inline-flex; align-items:center; gap:8px;">
      <span ${state.isAdmin ? `data-photo-player="${p.id}" title="Tap to change photo" style="cursor:pointer; display:inline-flex;"` : 'style="display:inline-flex;"'}>${avatarHtml(p, 26)}</span>
      ${escapeHtml(p.name)}
      ${canManagePlayers ? `<span data-link-slot="${p.id}">${p.ownerUid ? `<button type="button" class="ghost" data-link-player="${p.id}" style="font-size:11px; padding:2px 6px;">Linked ✓</button>` : `<button type="button" class="ghost" data-link-player="${p.id}" style="font-size:11px; padding:2px 6px;">Link to user</button>`}</span>` : ''}
      ${canManagePlayers ? `<button data-remove-player="${p.id}" title="Remove player">×</button>` : ''}
    </div>
  `).join('');

  if(canManagePlayers) markSelfLinkedChips();
  renderLinkPanel();
}

/* Self-created profiles (id === their own uid) are already "linked" in
   every functional sense - there's just no ownerUid field to check for
   them, since that field only exists for the admin-linking path. Without
   this pass, self-created players would misleadingly show "Link to user"
   even though nothing needs to be done for them. */
async function markSelfLinkedChips(){
  let users = [];
  try{
    const snap = await getDocs(usersCol);
    users = snap.docs.map(d => d.id);
  }catch(e){
    return; // non-critical - chips just keep showing the default label
  }
  const userIds = new Set(users);
  state.data.players.forEach(p => {
    if(p.ownerUid) return; // already handled by the ownerUid branch above
    if(!userIds.has(p.id)) return; // not a self-created profile
    const slot = document.querySelector(`[data-link-slot="${p.id}"]`);
    if(slot) slot.innerHTML = '';
  });
}

/* Which signed-up user (if any) a player is linked to determines who can
   vote on their behalf, edit their profile, etc. Self-created profiles
   already have this built in (their doc ID is their own uid); this panel
   is for retroactively linking players an ADMIN originally created. */
async function renderLinkPanel(){
  const panel = document.getElementById('squad-link-panel');
  if(!panel) return;
  if(!state.linkingPlayerId){ panel.innerHTML = ''; return; }

  const player = state.data.players.find(p => p.id === state.linkingPlayerId);
  if(!player){ state.linkingPlayerId = null; panel.innerHTML = ''; return; }

  let users = [];
  try{
    const snap = await getDocs(usersCol);
    users = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.approved);
  }catch(e){
    panel.innerHTML = `<div class="card"><div style="font-size:12px; color:rgba(22,24,28,0.5);">Could not load users: ${escapeHtml(e.message)}</div></div>`;
    return;
  }

  panel.innerHTML = `
    <div class="card">
      <label style="color:var(--pitch-dark);">Link ${escapeHtml(player.name)} to a user account</label>
      <p style="font-size:12px; color:rgba(22,24,28,0.5); margin:-6px 0 10px;">Once linked, that person can vote on matches they played in and edit their own profile.</p>
      <select id="link-user-select">
        <option value="">Select a user…</option>
        ${users.map(u => `<option value="${u.id}" ${player.ownerUid === u.id ? 'selected' : ''}>${escapeHtml(u.displayName || u.email)}</option>`).join('')}
      </select>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button type="button" class="primary" id="confirm-link-btn" style="width:auto; flex:1;">Save link</button>
        ${player.ownerUid ? `<button type="button" class="ghost" id="unlink-btn">Remove link</button>` : ''}
        <button type="button" class="secondary" id="cancel-link-btn" style="width:auto;">Cancel</button>
      </div>
    </div>
  `;
}

export function initSquad(){
  document.getElementById('toggle-manage-players-btn').addEventListener('click', () => {
    state.showManagePlayers = !state.showManagePlayers;
    document.getElementById('toggle-manage-players-btn').textContent = state.showManagePlayers ? 'Hide player management' : 'Manage player profiles';
    renderSquad();
  });

  document.getElementById('squad-my-profile-section').addEventListener('click', (e) => {
    const createBtn = e.target.closest('#create-my-profile-btn');
    if(createBtn){
      state.creatingMyProfile = true;
      renderSquad();
      return;
    }
    const editBtn = e.target.closest('[data-edit-profile]');
    if(editBtn){
      e.stopPropagation();
      state.profileEditPlayerId = editBtn.getAttribute('data-edit-profile');
      renderSquad();
      return;
    }
    const cancelBtn = e.target.closest('.pf-cancel');
    if(cancelBtn){
      e.stopPropagation();
      const formEl = cancelBtn.closest('.profile-form');
      if(formEl && formEl.dataset.mode === 'create'){
        state.creatingMyProfile = false;
      }else{
        state.profileEditPlayerId = null;
      }
      renderSquad();
      return;
    }
    const saveBtn = e.target.closest('.pf-save');
    if(saveBtn){
      e.stopPropagation();
      const formEl = saveBtn.closest('.profile-form');
      if(formEl && formEl.dataset.mode === 'create'){
        handleMyProfileCreate(formEl);
      }else{
        handleProfileSave(formEl);
      }
      return;
    }
  });

  document.getElementById('squad-list').addEventListener('click', (e) => {
    const avatarBtn = e.target.closest('[data-photo-player]');
    if(avatarBtn){
      triggerPhotoUpload(avatarBtn.getAttribute('data-photo-player'));
    }
  });

  document.getElementById('squad-link-panel').addEventListener('click', async (e) => {
    const confirmBtn = e.target.closest('#confirm-link-btn');
    if(confirmBtn){
      const select = document.getElementById('link-user-select');
      const uid = select.value;
      if(!uid){ showToast('Pick a user first'); return; }
      try{
        await updateDoc(doc(playersCol, state.linkingPlayerId), { ownerUid: uid });
      }catch(err){
        showToast('Could not save link: ' + err.message);
        return;
      }
      state.linkingPlayerId = null;
      await loadData();
      showToast('Player linked to user');
      return;
    }
    const unlinkBtn = e.target.closest('#unlink-btn');
    if(unlinkBtn){
      try{
        await updateDoc(doc(playersCol, state.linkingPlayerId), { ownerUid: null });
      }catch(err){
        showToast('Could not remove link: ' + err.message);
        return;
      }
      state.linkingPlayerId = null;
      await loadData();
      showToast('Link removed');
      return;
    }
    const cancelBtn = e.target.closest('#cancel-link-btn');
    if(cancelBtn){
      state.linkingPlayerId = null;
      renderSquad();
      return;
    }
  });

  document.getElementById('new-player-name').addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(pos, pos);
  });
  document.getElementById('add-player-btn').addEventListener('click', async () => {
    if(!state.isAdmin){ showToast('Admin only'); return; }
    const input = document.getElementById('new-player-name');
    const name = input.value.trim().toUpperCase();
    if(!name){ showToast('Enter a name first'); return; }
    if(state.data.players.some(p => p.name === name)){
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
    const linkBtn = e.target.closest('[data-link-player]');
    if(linkBtn){
      if(!state.isAdmin) return;
      state.linkingPlayerId = linkBtn.getAttribute('data-link-player');
      renderSquad();
      return;
    }
    const btn = e.target.closest('[data-remove-player]');
    if(!btn) return;
    if(!state.isAdmin){ showToast('Admin only'); return; }
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
}