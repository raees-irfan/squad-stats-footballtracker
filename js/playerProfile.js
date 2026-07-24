/* ---------- Player profile forms, FPL-style card, Player Stats panel ---------- */
import { state } from './state.js';
import { escapeHtml, showToast } from './utils.js';
import { avatarHtml, triggerPhotoUpload } from './photos.js';
import { POSITION_META } from './constants.js';
import { playersCol, doc, setDoc, updateDoc } from './firebase.js';
import { loadData } from './data.js';
import { computePlayerStats } from './stats.js';
import { ensurePlayerRatings, getPlayerRatingValues, computeOverall } from './ratings.js';
import { canViewData } from './auth.js';
import { pendingApprovalHtml } from './data.js';
import { isMyPlayer } from './ownership.js';

/* Which player's card is expanded, and which player's profile form (if any)
   is currently open, in the Player Stats panel — lives in shared state
   (state.expandedPlayerId / state.profileEditPlayerId). */

export function profileFieldsHtml(pr = {}){
  return `
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
  `;
}

export function profileFormHtml(player){
  const pr = player.profile || {};
  return `
    <div class="profile-form" data-player-id="${player.id}" data-mode="edit">
      ${profileFieldsHtml(pr)}
      <div style="display:flex; gap:8px; margin-top:4px;">
        <button type="button" class="primary pf-save" style="width:auto; flex:1;">Save card</button>
        <button type="button" class="secondary pf-cancel" style="width:auto;">Cancel</button>
      </div>
    </div>
  `;
}

export function myProfilePromptHtml(){
  return `
    <div class="card">
      <p style="margin:0 0 10px; font-size:14px;">You don't have a player profile yet — create one to show up in the squad and get tracked in matches.</p>
      <button type="button" class="primary" id="create-my-profile-btn" style="width:auto;">Create my profile</button>
    </div>
  `;
}

export function myProfileFormHtml(){
  return `
    <div class="card">
      <label style="color:var(--pitch-dark);">Set up your profile</label>
      <div class="profile-form" data-mode="create">
        <label>Your name (saved in CAPS)</label>
        <input type="text" class="pf-name" style="text-transform:uppercase;" placeholder="YOUR NAME">
        ${profileFieldsHtml({})}
        <div style="display:flex; gap:8px; margin-top:4px;">
          <button type="button" class="primary pf-save" style="width:auto; flex:1;">Create profile</button>
          <button type="button" class="secondary pf-cancel" style="width:auto;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function readProfileFieldsFromForm(formEl){
  const jerseyRaw = formEl.querySelector('.pf-jersey').value;
  const ageRaw = formEl.querySelector('.pf-age').value;
  const heightRaw = formEl.querySelector('.pf-height').value;
  return {
    position: formEl.querySelector('.pf-position').value,
    jerseyNumber: jerseyRaw !== '' ? parseInt(jerseyRaw) : null,
    age: ageRaw !== '' ? parseInt(ageRaw) : null,
    height: heightRaw !== '' ? parseInt(heightRaw) : null,
    favouriteTeam: formEl.querySelector('.pf-team').value.trim(),
    preferredFoot: formEl.querySelector('.pf-foot').value,
    nickname: formEl.querySelector('.pf-nickname').value.trim(),
    bio: formEl.querySelector('.pf-bio').value.trim(),
    submitted: true
  };
}

export async function handleMyProfileCreate(formEl){
  if(!state.currentUser) return;
  const nameInput = formEl.querySelector('.pf-name');
  const name = nameInput.value.trim().toUpperCase();
  if(!name){ showToast('Enter your name'); return; }
  if(state.data.players.some(p => p.name === name)){ showToast('That name is already taken — pick another'); return; }

  const position = formEl.querySelector('.pf-position').value;
  if(!position){ showToast('Pick a position first'); return; }

  const profile = readProfileFieldsFromForm(formEl);

  try{
    await setDoc(doc(playersCol, state.currentUser.uid), { name, profile });
  }catch(e){
    showToast('Could not create your profile: ' + e.message);
    return;
  }

  state.creatingMyProfile = false;
  await loadData();
  showToast('Profile created!');
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
      ${(state.isAdmin || isMyPlayer(player)) ? `<button type="button" class="ghost" data-edit-profile="${player.id}" style="margin-top:8px;">Edit profile</button>` : ''}
    </div>
  `;
}

function expandedCardHtml(r, player){
  if(state.profileEditPlayerId === player.id){
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

export async function handleProfileSave(formEl){
  if(!formEl) return;
  const playerId = formEl.getAttribute('data-player-id');
  const player = state.data.players.find(p => p.id === playerId);
  if(!player) return;

  const isOwner = isMyPlayer(player);
  const wasSubmitted = !!(player.profile && player.profile.submitted);
  if(wasSubmitted && !state.isAdmin && !isOwner){
    showToast('Only admin or the profile owner can edit this card');
    return;
  }

  const position = formEl.querySelector('.pf-position').value;
  if(!position){ showToast('Pick a position first'); return; }

  const profile = readProfileFieldsFromForm(formEl);

  try{
    await updateDoc(doc(playersCol, playerId), { profile });
  }catch(e){
    showToast('Could not save card: ' + e.message);
    return;
  }

  state.profileEditPlayerId = null;
  await loadData();
  showToast(wasSubmitted ? 'Profile updated' : 'Card set up!');
}

/* ---------- Player Stats: compact list -> tap to expand into card ---------- */
export function renderPlayerStats(){
  const wrap = document.getElementById('playerstats-content');
  if(!state.currentUser){
    wrap.innerHTML = '<div class="empty-state"><span class="display">Sign in</span>Sign in to see player stats.</div>';
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
  const stats = computePlayerStats();

  let dirty = false;
  state.data.players.forEach(p => {
    if(ensurePlayerRatings(p, stats[p.id])) dirty = true;
  });
  if(dirty){
    state.data.players.forEach(p => {
      if(p.ratings){
        updateDoc(doc(playersCol, p.id), { ratings: p.ratings }).catch(() => {});
      }
    });
  }

  const rows = Object.values(stats)
    .map(r => {
      const player = state.data.players.find(p => p.id === r.id) || { id: r.id, name: r.name };
      return { r, player, overall: computeOverall(player) };
    })
    .sort((a, b) => b.overall - a.overall || b.r.points - a.r.points || a.r.name.localeCompare(b.r.name));

  wrap.innerHTML = rows.map(({ r, player, overall }) => {
    const expanded = state.expandedPlayerId === r.id;
    const posMeta = player.profile && player.profile.position ? POSITION_META[player.profile.position] : null;
    const posBadge = posMeta
      ? `<span class="pos-badge" style="background:${posMeta.color};">${posMeta.label}</span>`
      : `<span class="pos-badge pos-badge--empty">SET UP</span>`;

    const ratings = getPlayerRatingValues(player);

    return `
      <div class="card player-row" data-player-toggle="${r.id}">
        <div class="player-row-top">
          <span ${(state.isAdmin || isMyPlayer(player)) ? `data-photo-player="${r.id}" title="Tap to change photo" style="cursor:pointer; display:inline-flex;"` : 'style="display:inline-flex;"'}>${avatarHtml(player, 40)}</span>
          <div class="player-row-mid">
            <div class="player-row-name">${escapeHtml(r.name)}</div>
            ${posBadge}
          </div>
          <div class="player-row-stats">
            <div class="ovr-block"><span>${overall}</span>OVR</div>
            <div><span>${ratings.finishing}</span>FIN</div>
            <div><span>${ratings.passing}</span>PAS</div>
            <div><span>${ratings.defending}</span>DEF</div>
            <div><span>${r.matches}</span>MP</div>
          </div>
        </div>
        ${expanded ? expandedCardHtml(r, player) : ''}
      </div>
    `;
  }).join('');
}

export function initPlayerStats(){
  document.getElementById('playerstats-content').addEventListener('click', (e) => {
    const avatarBtn = e.target.closest('[data-photo-player]');
    if(avatarBtn){
      triggerPhotoUpload(avatarBtn.getAttribute('data-photo-player'));
      return;
    }
    const setupBtn = e.target.closest('[data-setup-profile]');
    if(setupBtn){
      e.stopPropagation();
      state.profileEditPlayerId = setupBtn.getAttribute('data-setup-profile');
      renderPlayerStats();
      return;
    }
    const editBtn = e.target.closest('[data-edit-profile]');
    if(editBtn){
      e.stopPropagation();
      const targetId = editBtn.getAttribute('data-edit-profile');
      const targetPlayer = state.data.players.find(p => p.id === targetId);
      if(!state.isAdmin && !isMyPlayer(targetPlayer)) return;
      state.profileEditPlayerId = targetId;
      renderPlayerStats();
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
      renderPlayerStats();
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
    if(e.target.closest('.profile-form')) return; // don't toggle while interacting with form fields

    const toggleRow = e.target.closest('[data-player-toggle]');
    if(toggleRow){
      const id = toggleRow.getAttribute('data-player-toggle');
      state.expandedPlayerId = state.expandedPlayerId === id ? null : id;
      renderPlayerStats();
    }
  });
}