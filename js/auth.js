/* ---------- Auth (sign up / sign in / sign out / auth state) ---------- */
import { state } from './state.js';
import {
  auth, usersCol, doc, getDoc, setDoc,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase.js';
import { showToast } from './utils.js';
import { loadData, renderAll } from './data.js';
import { refreshAdminPanels } from './feedback.js';
import { renderSquad } from './squad.js';
import { renderHistory } from './history.js';
import { renderPlayerStats } from './playerProfile.js';
import { exitEditMode, resetMatchForm } from './match.js';
import { switchPanel } from './nav.js';

export function canViewData(){
  return state.isAdmin || (state.currentUser && state.currentUser.approved);
}

export function updateAdminUI(){
  document.getElementById('admin-settings').style.display = state.isAdmin ? 'block' : 'none';
  if(state.isAdmin) refreshAdminPanels();
  updateNavVisibility();
  renderSquad();
  renderHistory();
  renderPlayerStats();
}

export function updateNavVisibility(){
  const newMatchBtn = document.querySelector('nav button[data-panel="newmatch"]');
  newMatchBtn.style.display = state.isAdmin ? '' : 'none';
  if(!state.isAdmin){
    if(state.editingMatchId){ exitEditMode(); resetMatchForm(); }
    if(newMatchBtn.classList.contains('active')){
      switchPanel('squad');
    }
  }
}

export function initAuth(){
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
      state.currentUser = { uid: user.uid, email: user.email, displayName, role, approved };
      state.isAdmin = role === 'admin';
      document.getElementById('auth-signed-out').style.display = 'none';
      document.getElementById('auth-signed-in').style.display = 'flex';
      document.getElementById('auth-user-label').textContent = `${displayName} (${state.isAdmin ? 'admin' : approved ? 'user' : 'pending approval'})`;
      document.getElementById('feedback-btn').style.display = state.isAdmin ? 'none' : 'inline-block';
      document.getElementById('auth-email').value = '';
      document.getElementById('auth-password').value = '';
      await loadData();
    }else{
      state.currentUser = null;
      state.isAdmin = false;
      document.getElementById('auth-signed-out').style.display = 'flex';
      document.getElementById('auth-signed-in').style.display = 'none';
      state.data = { players: [], matches: [] };
      renderAll();
    }
    updateAdminUI();
  });
}