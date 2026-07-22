/* ---------- Small shared helpers: HTML escaping, dates, toast, modal ---------- */

export function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function formatDate(d){
  if(!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
}

export function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

/* ---------- Custom modal (replaces prompt/confirm) ---------- */
export function showModal({ title = '', message = '', showInput = false, inputType = 'text', useTextarea = false, confirmText = 'OK', cancelText = 'Cancel' } = {}){
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