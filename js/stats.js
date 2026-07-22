/* ---------- Shared stat computation: goals and assists only ---------- */
import { state } from './state.js';
import { POINTS } from './constants.js';

export function computePlayerStats(){
  const stats = {};
  state.data.players.forEach(p => { stats[p.id] = { id: p.id, name: p.name, goals: 0, assists: 0, matches: 0, points: 0 }; });

  state.data.matches.forEach(m => {
    [...m.teamA.players, ...m.teamB.players].forEach(pid => {
      if(stats[pid]) stats[pid].matches++;
    });
    m.events.forEach(ev => {
      if(!stats[ev.playerId]) return;
      if(ev.type === 'goal'){ stats[ev.playerId].goals++; stats[ev.playerId].points += POINTS.GOAL; }
      if(ev.type === 'assist'){ stats[ev.playerId].assists++; stats[ev.playerId].points += POINTS.ASSIST; }
    });
  });
  return stats;
}