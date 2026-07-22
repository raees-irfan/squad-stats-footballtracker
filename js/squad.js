/* ---------- Squad / Profile tab ---------- */
import { state } from './state.js';
import { escapeHtml, showModal, showToast } from './utils.js';
import { avatarHtml, triggerPhotoUpload } from './photos.js';
import { playersCol, doc, addDoc, deleteDoc } from './firebase.js';
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
  const list = document.getElementById('squad-list');

  titleEl.textContent = 'Profile';

  if(!state.currentUser){
    adminCard.style.display = 'none';
    myProfileWrap.innerHTML = '';
    list.innerHTML = '<div class="empty-state" style="width:100%;">Sign in to see the squad.</div>';
    return;
  }
  if(!canViewData()){
    adminCard.style.display = 'none';
    myProfileWrap.innerHTML = '';
    list.innerHTML = pendingApprovalHtml();
    return;
  }

  if(state.isAdmin){
    adminCard.style.display = '';
    myProfileWrap.innerHTML = '';
  }else{
    adminCard.style.display = 'none';
    myProfileWrap.innerHTML = myProfileSquadSectionHtml();
  }

  if(state.data.players.length === 0){
    list.innerHTML = `<div class="empty-state" style="width:100%;">No players yet.${state.isAdmin ? ' Add your first squad member above.' : ''}</div>`;
    return;
  }
  list.innerHTML = state.data.players.map(p => `
    <div class="chip" style="display:inline-flex; align-items:center; gap:8px;">
      <span ${state.isAdmin ? `data-photo-player="${p.id}" title="Tap to change photo" style="cursor:pointer; display:inline-flex;"` : 'style="display:inline-flex;"'}>${avatarHtml(p, 26)}</span>
      ${escapeHtml(p.name)}
      ${state.isAdmin ? `<button data-remove-player="${p.id}" title="Remove player">×</button>` : ''}
    </div>
  `).join('');
}

export function initSquad(){
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