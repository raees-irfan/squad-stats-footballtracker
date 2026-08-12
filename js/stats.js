/* ---------- Shared stat computation: goals, assists, MVP, team-win bonus,
   performance bonus (DEF rating only), and Best Defender awards ---------- */
import { state } from './state.js';
import { POINTS } from './constants.js';

export function computePlayerStats(){
  const stats = {};
  state.data.players.forEach(p => {
    stats[p.id] = {
      id: p.id, name: p.name, goals: 0, assists: 0, matches: 0, mvps: 0, wins: 0, points: 0, defPoints: 0,
      // Every Leaderboard point source writes to its own bucket here too,
      // so the "why does this player have this many points" breakdown is
      // correct by construction - not inferred after the fact, which
      // would silently misattribute anything if a new source gets added
      // later and someone forgets to update the inference.
      breakdown: { goals: 0, assists: 0, win: 0, mvp: 0, bestDefender: 0 },
      // Same idea, but for what's actually fed INTO defPoints (used by the
      // admin-only rating breakdown - the DEF number alone doesn't say
      // whether it came from clean-sheet-style performance bonuses or
      // genuine Best Defender picks, this does).
      defBreakdown: { performanceBonusMatches: 0, bestDefender1st: 0, bestDefender2nd: 0, bestDefender3rd: 0, bestDefender4th: 0, bestDefender5th: 0 }
    };
  });

  state.data.matches.forEach(m => {
    [...m.teamA.players, ...m.teamB.players].forEach(pid => {
      if(stats[pid]) stats[pid].matches++;
    });
    m.events.forEach(ev => {
      if(!stats[ev.playerId]) return;
      if(ev.type === 'goal'){ stats[ev.playerId].goals++; stats[ev.playerId].points += POINTS.GOAL; stats[ev.playerId].breakdown.goals += POINTS.GOAL; }
      if(ev.type === 'assist'){ stats[ev.playerId].assists++; stats[ev.playerId].points += POINTS.ASSIST; stats[ev.playerId].breakdown.assists += POINTS.ASSIST; }
    });
    if(m.pollClosed && m.mvpPlayerId && stats[m.mvpPlayerId]){
      stats[m.mvpPlayerId].mvps++;
      stats[m.mvpPlayerId].points += POINTS.MVP;
      stats[m.mvpPlayerId].breakdown.mvp += POINTS.MVP;
    }
    // Every player on the winning team gets a flat bonus. A draw (equal
    // scores) awards nobody a win bonus.
    if(m.scoreA !== m.scoreB){
      const winningTeam = m.scoreA > m.scoreB ? m.teamA.players : m.teamB.players;
      winningTeam.forEach(pid => {
        if(!stats[pid]) return;
        stats[pid].wins++;
        stats[pid].points += POINTS.WIN;
        stats[pid].breakdown.win += POINTS.WIN;
      });
    }

    // Performance bonus: if a team concedes 5 goals or fewer, every player
    // on that team gets a defPoints bump (boosts DEF rating only, does
    // not count toward Leaderboard points).
    // Team A concedes what Team B scores, Team B concedes what Team A scores
    if(m.scoreB <= 5){
      m.teamA.players.forEach(pid => {
        if(stats[pid]){
          stats[pid].defPoints += POINTS.PERFORMANCE_BONUS;
          stats[pid].defBreakdown.performanceBonusMatches++;
        }
      });
    }
    if(m.scoreA <= 5){
      m.teamB.players.forEach(pid => {
        if(stats[pid]){
          stats[pid].defPoints += POINTS.PERFORMANCE_BONUS;
          stats[pid].defBreakdown.performanceBonusMatches++;
        }
      });
    }

    // Best Defender (admin-picked at match-logging time, from any player
    // in the match regardless of position): counts toward BOTH Leaderboard
    // points AND defPoints - this is defenders' equivalent of goals/assists
    // giving forwards/midfielders a way to earn points.
    if(m.bestDefender1st && stats[m.bestDefender1st]){
      stats[m.bestDefender1st].points += POINTS.BEST_DEFENDER_1ST;
      stats[m.bestDefender1st].defPoints += POINTS.BEST_DEFENDER_1ST;
      stats[m.bestDefender1st].breakdown.bestDefender += POINTS.BEST_DEFENDER_1ST;
      stats[m.bestDefender1st].defBreakdown.bestDefender1st++;
    }
    if(m.bestDefender2nd && stats[m.bestDefender2nd]){
      stats[m.bestDefender2nd].points += POINTS.BEST_DEFENDER_2ND;
      stats[m.bestDefender2nd].defPoints += POINTS.BEST_DEFENDER_2ND;
      stats[m.bestDefender2nd].breakdown.bestDefender += POINTS.BEST_DEFENDER_2ND;
      stats[m.bestDefender2nd].defBreakdown.bestDefender2nd++;
    }
    if(m.bestDefender3rd && stats[m.bestDefender3rd]){
      stats[m.bestDefender3rd].points += POINTS.BEST_DEFENDER_3RD;
      stats[m.bestDefender3rd].defPoints += POINTS.BEST_DEFENDER_3RD;
      stats[m.bestDefender3rd].breakdown.bestDefender += POINTS.BEST_DEFENDER_3RD;
      stats[m.bestDefender3rd].defBreakdown.bestDefender3rd++;
    }
    if(m.bestDefender4th && stats[m.bestDefender4th]){
      stats[m.bestDefender4th].points += POINTS.BEST_DEFENDER_4TH;
      stats[m.bestDefender4th].defPoints += POINTS.BEST_DEFENDER_4TH;
      stats[m.bestDefender4th].breakdown.bestDefender += POINTS.BEST_DEFENDER_4TH;
      stats[m.bestDefender4th].defBreakdown.bestDefender4th++;
    }
    if(m.bestDefender5th && stats[m.bestDefender5th]){
      stats[m.bestDefender5th].points += POINTS.BEST_DEFENDER_5TH;
      stats[m.bestDefender5th].defPoints += POINTS.BEST_DEFENDER_5TH;
      stats[m.bestDefender5th].breakdown.bestDefender += POINTS.BEST_DEFENDER_5TH;
      stats[m.bestDefender5th].defBreakdown.bestDefender5th++;
    }
  });
  return stats;
}