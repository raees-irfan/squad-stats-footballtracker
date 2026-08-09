/* ---------- Shared stat computation: goals, assists, MVP, team-win bonus,
   performance bonus (DEF rating only), and Best Defender awards ---------- */
import { state } from './state.js';
import { POINTS } from './constants.js';

export function computePlayerStats(){
  const stats = {};
  state.data.players.forEach(p => { stats[p.id] = { id: p.id, name: p.name, goals: 0, assists: 0, matches: 0, mvps: 0, wins: 0, points: 0, defPoints: 0 }; });

  state.data.matches.forEach(m => {
    [...m.teamA.players, ...m.teamB.players].forEach(pid => {
      if(stats[pid]) stats[pid].matches++;
    });
    m.events.forEach(ev => {
      if(!stats[ev.playerId]) return;
      if(ev.type === 'goal'){ stats[ev.playerId].goals++; stats[ev.playerId].points += POINTS.GOAL; }
      if(ev.type === 'assist'){ stats[ev.playerId].assists++; stats[ev.playerId].points += POINTS.ASSIST; }
    });
    if(m.pollClosed && m.mvpPlayerId && stats[m.mvpPlayerId]){
      stats[m.mvpPlayerId].mvps++;
      stats[m.mvpPlayerId].points += POINTS.MVP;
    }
    // Every player on the winning team gets a flat bonus. A draw (equal
    // scores) awards nobody a win bonus.
    if(m.scoreA !== m.scoreB){
      const winningTeam = m.scoreA > m.scoreB ? m.teamA.players : m.teamB.players;
      winningTeam.forEach(pid => {
        if(!stats[pid]) return;
        stats[pid].wins++;
        stats[pid].points += POINTS.WIN;
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
        }
      });
    }
    if(m.scoreA <= 5){
      m.teamB.players.forEach(pid => {
        if(stats[pid]){
          stats[pid].defPoints += POINTS.PERFORMANCE_BONUS;
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
    }
    if(m.bestDefender2nd && stats[m.bestDefender2nd]){
      stats[m.bestDefender2nd].points += POINTS.BEST_DEFENDER_2ND;
      stats[m.bestDefender2nd].defPoints += POINTS.BEST_DEFENDER_2ND;
    }
    if(m.bestDefender3rd && stats[m.bestDefender3rd]){
      stats[m.bestDefender3rd].points += POINTS.BEST_DEFENDER_3RD;
      stats[m.bestDefender3rd].defPoints += POINTS.BEST_DEFENDER_3RD;
    }
  });
  return stats;
}