/* ---------- Nav (panel switching) ---------- */
export function switchPanel(name){
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
}

export function initNav(){
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });
}