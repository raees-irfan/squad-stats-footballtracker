/* ---------- App entry point ----------
   Wires up every module's event listeners, then does the initial render.
   Load this file as: <script type="module" src="./js/main.js"></script> */
import { initPhotoUpload } from './photos.js';
import { initAuth, updateNavVisibility } from './auth.js';
import { initFeedback } from './feedback.js';
import { initSquad } from './squad.js';
import { initMatch } from './match.js';
import { initHistory } from './history.js';
import { initPlayerStats } from './playerProfile.js';
import { initNav } from './nav.js';
import { renderAll } from './data.js';

// init
document.getElementById('match-date').valueAsDate = new Date();

initPhotoUpload();
initAuth();
initFeedback();
initSquad();
initMatch();
initHistory();
initPlayerStats();
initNav();

updateNavVisibility();
renderAll();