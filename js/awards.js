/* ---------- Yearly awards (admin-only) ----------
   Three season-long "hall of fame" style awards, computed per calendar
   year from the match date:
   - Ballon d'Or (Player of the Year): most MVP awards that year
   - Golden Boot: most goals scored that year
   - Playmaker of the Year: most assists that year
   Ties are shown as a shared win rather than arbitrarily picking one
   name - these are symbolic season awards, not something worth a
   tiebreak rule over. Shows every year present in the match data, most
   recent first, not just the current year - so past seasons stay
   visible instead of disappearing once the calendar rolls over.
   Rendered only inside the admin-settings panel, which is already
   hidden from non-admins - nothing extra to gate here.

   Season window: tallying for a given year only counts matches dated
   Dec 30 or earlier that year - Dec 31 is a buffer day, uncounted, before
   results reveal. This is a general per-year rule (not a 2026 special
   case), so it applies the same way to every season, past and future. */
import { state } from './state.js';
import { escapeHtml } from './utils.js';

const CUTOFF_MONTH = 11; // December, 0-indexed
const CUTOFF_DAY = 30;
const REVEAL_MONTH = 11;
const REVEAL_DAY = 31;

function getYear(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d) ? null : d.getFullYear();
}

/* A match counts toward a year's awards only if it falls on or before
   Dec 30 of that year - Dec 31 matches (rare, but possible) don't count
   toward either year, they're just outside the counted window. */
function isWithinAwardWindow(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  if(isNaN(d)) return false;
  if(d.getMonth() === CUTOFF_MONTH && d.getDate() > CUTOFF_DAY) return false;
  return true;
}

/* Results for a year only become visible once the real, current date has
   reached Dec 31 of that year - before that, the section stays locked. */
function isRevealed(year){
  const now = new Date();
  const revealDate = new Date(year, REVEAL_MONTH, REVEAL_DAY);
  return now >= revealDate;
}

function nameOf(id){
  const p = state.data.players.find(p => p.id === id);
  return p ? p.name : '(removed player)';
}

function topPlayers(countsObj){
  const entries = Object.entries(countsObj);
  if(entries.length === 0) return { count: 0, ids: [] };
  const max = Math.max(...entries.map(([, c]) => c));
  if(max === 0) return { count: 0, ids: [] };
  return { count: max, ids: entries.filter(([, c]) => c === max).map(([id]) => id) };
}

export function computeYearlyAwards(){
  const byYear = {};
  state.data.matches.forEach(m => {
    if(!isWithinAwardWindow(m.date)) return;
    const year = getYear(m.date);
    if(year === null) return;
    if(!byYear[year]) byYear[year] = { mvpCounts: {}, goalCounts: {}, assistCounts: {} };

    if(m.pollClosed && m.mvpPlayerId){
      byYear[year].mvpCounts[m.mvpPlayerId] = (byYear[year].mvpCounts[m.mvpPlayerId] || 0) + 1;
    }
    m.events.forEach(ev => {
      if(ev.type === 'goal'){
        byYear[year].goalCounts[ev.playerId] = (byYear[year].goalCounts[ev.playerId] || 0) + 1;
      }
      if(ev.type === 'assist'){
        byYear[year].assistCounts[ev.playerId] = (byYear[year].assistCounts[ev.playerId] || 0) + 1;
      }
    });
  });

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  return years.map(year => ({
    year,
    revealed: isRevealed(year),
    ballonDor: topPlayers(byYear[year].mvpCounts),
    goldenBoot: topPlayers(byYear[year].goalCounts),
    playmaker: topPlayers(byYear[year].assistCounts)
  }));
}

function awardLine(label, emoji, award, unit){
  if(award.count === 0){
    return `<div style="font-size:13px; margin-bottom:4px;">${emoji} ${label}: <span style="color:rgba(22,24,28,0.4);">No winner yet</span></div>`;
  }
  const names = award.ids.map(id => escapeHtml(nameOf(id))).join(', ');
  return `<div style="font-size:13px; margin-bottom:4px;">${emoji} ${label}: <strong>${names}</strong> (${award.count} ${unit}${award.count === 1 ? '' : 's'})</div>`;
}

export function yearlyAwardsHtml(){
  const awards = computeYearlyAwards();
  if(awards.length === 0){
    return '<div style="font-size:12px; color:rgba(22,24,28,0.5);">No matches logged yet.</div>';
  }
  return awards.map(a => {
    if(!a.revealed){
      return `
        <div style="padding:8px 0; border-bottom:1px solid var(--line);">
          <div style="font-family:'Space Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">${a.year}</div>
          <div style="font-size:13px; color:rgba(22,24,28,0.5);">🔒 Results reveal on Dec 31, ${a.year}</div>
        </div>
      `;
    }
    return `
      <div style="padding:8px 0; border-bottom:1px solid var(--line);">
        <div style="font-family:'Space Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:rgba(22,24,28,0.5); margin-bottom:6px;">${a.year}</div>
        ${awardLine("Ballon d'Or (Player of the Year)", '🏆', a.ballonDor, 'MVP')}
        ${awardLine('Golden Boot', '👟', a.goldenBoot, 'goal')}
        ${awardLine('Playmaker of the Year', '🎯', a.playmaker, 'assist')}
      </div>
    `;
  }).join('');
}

export function renderYearlyAwards(){
  const wrap = document.getElementById('yearly-awards-content');
  if(!wrap) return;
  if(!state.isAdmin){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = yearlyAwardsHtml();
}
