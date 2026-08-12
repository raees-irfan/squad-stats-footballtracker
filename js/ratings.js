/* ---------- Player rating calculation (deterministic, no random rolls) ----------
   Rating = Base + (99 - Base) * (Rate / (Rate + K)), K fixed at 1.

   - FIN's Rate is goals per match.
   - PAS's Rate is assists per match.
   - DEF's Rate is defPoints per match.
   Base is set per position, per stat (see STAT_BASE in constants.js) - it's
   where that stat's curve starts, not a weighting on the final number.
   The curve climbs quickly at low rates and flattens out approaching 99
   (diminishing returns) - it mathematically never reaches 99.

   Unlike the old system, nothing here is stored or persisted: every value
   is a pure function of (position, live stat row), recalculated fresh on
   every render. There's no "locked in" number to maintain, no tiers, and
   no dirty-checking against Firestore. */
import { STAT_BASE, DEFAULT_BASE, RATING_K } from './constants.js';

function computeRating(base, rate){
  const r = rate > 0 ? rate : 0;
  return Math.round(base + (99 - base) * (r / (r + RATING_K)));
}

function basesForPosition(position){
  return STAT_BASE[position] || DEFAULT_BASE;
}

/* statRow = the player's row from computePlayerStats() - needs goals,
   assists, defPoints, matches. Returns the three rounded rating numbers. */
export function getPlayerRatingValues(player, statRow){
  const position = player.profile && player.profile.position;
  const base = basesForPosition(position);
  const matches = statRow ? statRow.matches : 0;

  const goalRate = matches ? statRow.goals / matches : 0;
  const assistRate = matches ? statRow.assists / matches : 0;
  const defRate = matches ? (statRow.defPoints || 0) / matches : 0;

  return {
    finishing: computeRating(base.finishing, goalRate),
    passing: computeRating(base.passing, assistRate),
    defending: computeRating(base.defending, defRate)
  };
}

export function computeOverall(player, statRow){
  const vals = getPlayerRatingValues(player, statRow);
  return Math.round((vals.finishing + vals.passing + vals.defending) / 3);
}
