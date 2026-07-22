/* ---------- FPL-style card rating calculation ---------- */
import { RATING_BASE, POSITION_WEIGHTS, DEFAULT_WEIGHTS } from './constants.js';

export function attackTier(avgPerMatch){
  if(avgPerMatch >= 5) return { key: 't5', min: 95, max: 99 };
  if(avgPerMatch >= 3) return { key: 't3', min: 90, max: 94 };
  if(avgPerMatch >= 2) return { key: 't2', min: 80, max: 89 };
  if(avgPerMatch >= 1) return { key: 't1', min: 70, max: 79 };
  return { key: 't0', min: RATING_BASE, max: RATING_BASE };
}

export function defendTier(matches, isGK = false){
  const base = isGK ? 70 : RATING_BASE; // Goalkeepers get higher base
  if(matches === 0) return { key: 'd0', min: base, max: base };
  if(matches >= 20) return { key: 'd3', min: isGK ? 90 : 85, max: isGK ? 97 : 92 };
  if(matches >= 10) return { key: 'd2', min: isGK ? 82 : 75, max: isGK ? 89 : 84 };
  if(matches >= 5) return { key: 'd1', min: isGK ? 75 : 65, max: isGK ? 84 : 74 };
  return { key: 'd0', min: base, max: base };
}

function rollInRange(min, max){
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function ensurePlayerRatings(player, statRow){
  if(!player.ratings) player.ratings = {};
  let dirty = false;
  const matches = statRow ? statRow.matches : 0;
  const avgGoals = matches ? statRow.goals / matches : 0;
  const avgAssists = matches ? statRow.assists / matches : 0;
  const isGK = player.profile && player.profile.position === 'GK';

  const tiers = {
    finishing: attackTier(avgGoals),
    passing: attackTier(avgAssists),
    defending: defendTier(matches, isGK)
  };

  Object.keys(tiers).forEach(cat => {
    const tier = tiers[cat];
    const existing = player.ratings[cat];
    if(!existing || existing.tierKey !== tier.key){
      player.ratings[cat] = { tierKey: tier.key, value: rollInRange(tier.min, tier.max) };
      dirty = true;
    }
  });
  return dirty;
}

export function getPlayerRatingValues(player){
  const r = player.ratings || {};
  return {
    finishing: r.finishing ? r.finishing.value : RATING_BASE,
    passing: r.passing ? r.passing.value : RATING_BASE,
    defending: r.defending ? r.defending.value : RATING_BASE
  };
}

export function computeOverall(player){
  const vals = getPlayerRatingValues(player);
  const pos = player.profile && player.profile.position;

  // For goalkeepers, use their highest stat as overall
  if(pos === 'GK'){
    return Math.max(vals.finishing, vals.passing, vals.defending);
  }

  // For other positions, use weighted average
  const w = POSITION_WEIGHTS[pos] || DEFAULT_WEIGHTS;
  return Math.round(vals.finishing * w.finishing + vals.passing * w.passing + vals.defending * w.defending);
}