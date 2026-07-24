/* ---------- Feedback (users -> admins) + admin user management ---------- */
import { state } from './state.js';
import { feedbackCol, usersCol, doc, getDocs, addDoc, updateDoc, deleteDoc } from './firebase.js';
import { showToast, showModal, escapeHtml } from './utils.js';

export function initFeedback(){
  document.getElementById('feedback-btn').addEventListener('click', async () => {
    if(!state.currentUser) return;
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
        authorUid: state.currentUser.uid,
        authorLabel: state.currentUser.displayName,
        message: msg,
        createdAt: Date.now(),
        status: 'open'
      });
      showToast('Feedback sent');
    }catch(e){
      showToast('Could not send feedback: ' + e.message);
    }
  });

  document.getElementById('toggle-users-list-btn').addEventListener('click', () => {
    state.showUsersList = !state.showUsersList;
    document.getElementById('admin-users-list').style.display = state.showUsersList ? 'block' : 'none';
    document.getElementById('toggle-users-list-btn').textContent = state.showUsersList ? 'Hide users' : 'Show users';
  });

  document.getElementById('toggle-manage-users-btn').addEventListener('click', () => {
    state.showManageUsers = !state.showManageUsers;
    document.getElementById('toggle-manage-users-btn').textContent = state.showManageUsers ? 'Hide user management' : 'Manage users';
    // Turning management mode on is pointless if the list is collapsed -
    // expand it automatically so the promote/remove buttons are visible.
    if(state.showManageUsers && !state.showUsersList){
      state.showUsersList = true;
      document.getElementById('admin-users-list').style.display = 'block';
      document.getElementById('toggle-users-list-btn').textContent = 'Hide users';
    }
    renderAdminUsers();
  });

  document.getElementById('admin-users-list').addEventListener('click', async (e) => {
    if(!state.isAdmin) return;
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
    const removeBtn = e.target.closest('[data-remove-user]');
    if(removeBtn){
      const uid = removeBtn.getAttribute('data-remove-user');
      const ok = await showModal({
        title: 'Remove user?',
        message: "This revokes their access to squad data — they'll show up as pending again if they sign back in. It does not delete their login itself, so the email/password still works to sign in.",
        confirmText: 'Remove',
        cancelText: 'Cancel'
      });
      if(!ok) return;
      try{
        await deleteDoc(doc(usersCol, uid));
        showToast('User removed');
        await renderAdminUsers();
      }catch(e){
        showToast('Could not remove user: ' + e.message);
      }
      return;
    }
  });

  document.getElementById('admin-feedback-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-resolve-feedback]');
    if(!btn || !state.isAdmin) return;
    const id = btn.getAttribute('data-resolve-feedback');
    try{
      await updateDoc(doc(feedbackCol, id), { status: 'resolved' });
      await renderAdminFeedback();
    }catch(e){
      showToast('Could not update feedback: ' + e.message);
    }
  });
}

export async function refreshAdminPanels(){
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
      const isSelf = state.currentUser && u.id === state.currentUser.uid;
      const actions = [];
      if(status === 'pending approval'){
        actions.push(`<button class="secondary" data-approve-user="${u.id}" style="width:auto;">Approve</button>`);
      }
      if(state.showManageUsers){
        if(status === 'user'){
          actions.push(`<button class="secondary" data-promote-user="${u.id}" style="width:auto;">Promote to admin</button>`);
        }
        if(!isSelf){
          actions.push(`<button class="ghost" data-remove-user="${u.id}">Remove</button>`);
        }
      }
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px;">
          <span>${escapeHtml(u.displayName || u.email)} <span style="font-family:'Space Mono',monospace; font-size:10px; color:rgba(22,24,28,0.5);">(${escapeHtml(status)})</span></span>
          <span style="display:flex; gap:6px;">${actions.join('')}</span>
        </div>
      `;
    }).join('');
  }catch(e){
    wrap.innerHTML = `<div style="font-size:12px; color:rgba(22,24,28,0.5);">Could not load users: ${escapeHtml(e.message)}</div>`;
  }
}

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