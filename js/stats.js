/* ---------- Shared stat computation: goals, assists, MVP, and team-win bonus ---------- */
import { state } from './state.js';
import { POINTS } from './constants.js';

export function computePlayerStats(){
  const stats = {};
  state.data.players.forEach(p => { stats[p.id] = { id: p.id, name: p.name, goals: 0, assists: 0, matches: 0, mvps: 0, wins: 0, points: 0 }; });

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
  });
  return stats;
}