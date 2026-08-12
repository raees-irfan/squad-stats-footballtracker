/* ---------- Points ---------- */
export const POINTS = {
  GOAL: 2,
  ASSIST: 2,
  MVP: 3,
  WIN: 4,
  BEST_DEFENDER_1ST: 5,
  BEST_DEFENDER_2ND: 4,
  BEST_DEFENDER_3RD: 3,
  BEST_DEFENDER_4TH: 2,
  BEST_DEFENDER_5TH: 1,
  // Awarded per player whenever their team concedes 5 goals or fewer in a
  // match. Boosts DEF rating only - does not add to Leaderboard points.
  PERFORMANCE_BONUS: 3
};

/* ---------- Hardcoded player photos ----------
   Optional: if you'd rather hardcode photos in code instead of (or alongside)
   uploading them via Admin settings, add entries here.
   Key = player name EXACTLY as it appears in the Profile tab (it's stored in CAPS).
   Value = any image URL, or a base64 data URL.
   Uploaded photos (saved via Admin) always take priority over this map.
------------------------------------------------- */
export const PLAYER_PHOTOS = {};

/* ---------- Player profiles & FPL-style card ratings ----------
   Each position has its own STARTING/BASE rating for each of the three
   stats (FIN/PAS/DEF) - not a weighting applied to the final number, but
   where that stat's curve starts from before any performance is factored
   in. GK uses the same bases as DEF (per an explicit call - the original
   spec only covered FWD/MID/DEF). DEFAULT_BASE is a neutral fallback for
   a player whose position isn't set yet (e.g. profile not filled in). */
export const STAT_BASE = {
  FWD: { finishing: 70, passing: 60, defending: 60 },
  MID: { finishing: 60, passing: 70, defending: 60 },
  DEF: { finishing: 60, passing: 60, defending: 70 },
  GK:  { finishing: 60, passing: 60, defending: 70 }
};
export const DEFAULT_BASE = { finishing: 60, passing: 60, defending: 60 };

/* K is fixed at 1 for every stat, permanently - Rating = Base + (99-Base) * (rate / (rate + K)) */
export const RATING_K = 1;

export const POSITION_META = {
  GK:  { label: 'GK',  full: 'Goalkeeper', color: 'var(--amber)' },
  DEF: { label: 'DEF', full: 'Defender',   color: 'var(--turf)' },
  MID: { label: 'MID', full: 'Midfielder', color: 'var(--pitch-dark)' },
  FWD: { label: 'FWD', full: 'Forward',    color: 'var(--red)' }
};