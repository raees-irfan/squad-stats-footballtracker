/* ---------- Points ---------- */
export const POINTS = {
  GOAL: 2,
  ASSIST: 1,
  MVP: 3,
  WIN: 4
};

/* ---------- Hardcoded player photos ----------
   Optional: if you'd rather hardcode photos in code instead of (or alongside)
   uploading them via Admin settings, add entries here.
   Key = player name EXACTLY as it appears in the Profile tab (it's stored in CAPS).
   Value = any image URL, or a base64 data URL.
   Uploaded photos (saved via Admin) always take priority over this map.
------------------------------------------------- */
export const PLAYER_PHOTOS = {};

/* ---------- Player profiles & FPL-style card ratings ---------- */
export const RATING_BASE = 60;

export const POSITION_META = {
  GK:  { label: 'GK',  full: 'Goalkeeper', color: 'var(--amber)' },
  DEF: { label: 'DEF', full: 'Defender',   color: 'var(--turf)' },
  MID: { label: 'MID', full: 'Midfielder', color: 'var(--pitch-dark)' },
  FWD: { label: 'FWD', full: 'Forward',    color: 'var(--red)' }
};

export const POSITION_WEIGHTS = {
  GK:  { finishing: 0.10, passing: 0.20, defending: 0.70 },
  DEF: { finishing: 0.15, passing: 0.25, defending: 0.60 },
  MID: { finishing: 0.30, passing: 0.40, defending: 0.30 },
  FWD: { finishing: 0.55, passing: 0.25, defending: 0.20 }
};
export const DEFAULT_WEIGHTS = { finishing: 0.34, passing: 0.33, defending: 0.33 };