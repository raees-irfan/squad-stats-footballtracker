/* ---------- Player photos: avatar rendering + upload (resize client-side, store as base64) ---------- */
import { state } from './state.js';
import { playersCol, doc, updateDoc } from './firebase.js';
import { escapeHtml, showToast } from './utils.js';
import { PLAYER_PHOTOS } from './constants.js';
import { loadData } from './data.js';
import { isMyPlayer } from './ownership.js';

export function getPlayerPhoto(player){
  if(!player) return null;
  return player.photo || PLAYER_PHOTOS[player.name] || null;
}

export function avatarHtml(player, size){
  const photo = getPlayerPhoto(player);
  const initials = escapeHtml((player.name || '?').trim().slice(0,2).toUpperCase());
  if(photo){
    return `<img src="${escapeHtml(photo)}" alt="${escapeHtml(player.name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;">`;
  }
  const fontSize = Math.round(size * 0.38);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--turf, #3D5C70);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:${fontSize}px;font-weight:700;flex-shrink:0;">${initials}</div>`;
}

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

export function triggerPhotoUpload(playerId){
  const player = state.data.players.find(p => p.id === playerId);
  if(!state.isAdmin && !isMyPlayer(player)){
    showToast('You can only change your own photo');
    return;
  }
  state.photoUploadTargetId = playerId;
  document.getElementById('photo-upload-input').click();
}

export function initPhotoUpload(){
  document.getElementById('photo-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!file || !state.photoUploadTargetId) return;
    const player = state.data.players.find(p => p.id === state.photoUploadTargetId);
    if(!player) return;
    try{
      const dataUrl = await readAndResizeImage(file);
      await updateDoc(doc(playersCol, player.id), { photo: dataUrl });
      await loadData();
      showToast('Photo updated for ' + player.name);
    }catch(err){
      showToast(err.message || 'Could not update photo');
    }finally{
      state.photoUploadTargetId = null;
    }
  });
}