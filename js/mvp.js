/* ---------- Match MVP voting ----------
   Rules recap (agreed in chat, not just code comments - keep in sync if
   this ever changes):
   - Only players who were actually in a given match can vote on its MVP.
   - No self-voting.
   - One vote per person per match - the vote is stored keyed by the
     VOTER's own uid, so re-voting just overwrites their own entry.
   - The moment the 10th vote lands, the poll auto-closes and a winner is
     recorded, computed by: most votes -> tiebreak on goals scored in that
     match -> tiebreak on assists scored in that match -> tiebreak on
     whoever has FEWER total career points (i.e. lower on the leaderboard,
     as a small boost to the underdog) -> final fallback is alphabetical
     by name, for determinism, in the vanishingly unlikely case everything
     else ties too.
   - Admins can also force-close a poll early (e.g. it stalls under 10). */
import { state } from './state.js';
import { matchesCol, doc, updateDoc } from './firebase.js';
import { escapeHtml, showToast, showModal } from './utils.js';
import { computePlayerStats } from './stats.js';
import { loadData } from './data.js';
import { getMyOwnedPlayerId } from './ownership.js';

const VOTES_TO_CLOSE = 10;

function nameOf(id){
  const p = state.data.players.find(p => p.id === id);
  return p ? p.name : '(removed player)';
}

/* A player is "owned by" the current user if either their profile doc ID
   IS the user's uid (self-service creation), or an admin has explicitly
   linked an existing player to that user's account via ownerUid. */
export { getMyOwnedPlayerId };

function isInMatch(match, playerId){
  return !!playerId && (match.teamA.players.includes(playerId) || match.teamB.players.includes(playerId));
}

export function canVoteOnMatch(match){
  if(!state.currentUser || match.pollClosed) return false;
  const myPlayerId = getMyOwnedPlayerId();
  return isInMatch(match, myPlayerId);
}

function tallyVotes(match){
  const tally = {};
  Object.values(match.votes || {}).forEach(playerId => {
    tally[playerId] = (tally[playerId] || 0) + 1;
  });
  return tally;
}

function goalsAssistsInMatch(match, playerId){
  let goals = 0, assists = 0;
  match.events.forEach(ev => {
    if(ev.playerId !== playerId) return;
    if(ev.type === 'goal') goals++;
    if(ev.type === 'assist') assists++;
  });
  return { goals, assists };
}

/* Returns the winning player ID given a match and its current votes, or
   null if nobody voted at all. */
export function computeMvpWinner(match){
  const tally = tallyVotes(match);
  const entries = Object.entries(tally);
  if(entries.length === 0) return null;

  const maxVotes = Math.max(...entries.map(([, c]) => c));
  let candidates = entries.filter(([, c]) => c === maxVotes).map(([id]) => id);
  if(candidates.length === 1) return candidates[0];

  // Tiebreak 1: goals scored in this match
  const withStats = candidates.map(id => ({ id, ...goalsAssistsInMatch(match, id) }));
  const maxGoals = Math.max(...withStats.map(c => c.goals));
  candidates = withStats.filter(c => c.goals === maxGoals).map(c => c.id);
  if(candidates.length === 1) return candidates[0];

  // Tiebreak 2: assists scored in this match
  const stillTiedStats = withStats.filter(c => candidates.includes(c.id));
  const maxAssists = Math.max(...stillTiedStats.map(c => c.assists));
  candidates = stillTiedStats.filter(c => c.assists === maxAssists).map(c => c.id);
  if(candidates.length === 1) return candidates[0];

  // Tiebreak 3: fewer total career points (lower on the leaderboard) wins
  const careerStats = computePlayerStats();
  const minPoints = Math.min(...candidates.map(id => (careerStats[id] ? careerStats[id].points : 0)));
  candidates = candidates.filter(id => (careerStats[id] ? careerStats[id].points : 0) === minPoints);
  if(candidates.length === 1) return candidates[0];

  // Final fallback: alphabetical, so the result is at least deterministic
  candidates.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return candidates[0];
}

async function castVote(matchId, votedForPlayerId){
  const match = state.data.matches.find(m => m.id === matchId);
  if(!match || !state.currentUser) return;
  if(!canVoteOnMatch(match)){ showToast('Only players who were in this match can vote'); return; }
  const myPlayerId = getMyOwnedPlayerId();
  if(votedForPlayerId === myPlayerId){ showToast("You can't vote for yourself"); return; }

  const newVotes = { ...(match.votes || {}), [state.currentUser.uid]: votedForPlayerId };
  const payload = { votes: newVotes };

  if(Object.keys(newVotes).length >= VOTES_TO_CLOSE){
    const winner = computeMvpWinner({ ...match, votes: newVotes });
    payload.pollClosed = true;
    payload.mvpPlayerId = winner;
  }

  try{
    await updateDoc(doc(matchesCol, matchId), payload);
  }catch(e){
    showToast('Could not cast vote: ' + e.message);
    return;
  }
  await loadData();
  showToast(payload.pollClosed ? `Voting closed - MVP is ${nameOf(payload.mvpPlayerId)}` : 'Vote cast');
}

async function forceCloseVoting(matchId){
  if(!state.isAdmin) return;
  const match = state.data.matches.find(m => m.id === matchId);
  if(!match) return;
  const ok = await showModal({
    title: 'Close voting now?',
    message: 'This ends the MVP poll early and records a winner from whatever votes are in so far (or no MVP if nobody has voted yet).',
    confirmText: 'Close voting',
    cancelText: 'Cancel'
  });
  if(!ok) return;
  const winner = computeMvpWinner(match);
  try{
    await updateDoc(doc(matchesCol, matchId), { pollClosed: true, mvpPlayerId: winner });
  }catch(e){
    showToast('Could not close voting: ' + e.message);
    return;
  }
  await loadData();
  showToast(winner ? `Voting closed - MVP is ${nameOf(winner)}` : 'Voting closed - no votes were cast');
}

/* ---------- Rendering ---------- */
export function mvpSectionHtml(match){
  const votes = match.votes || {};
  const voteCount = Object.keys(votes).length;

  if(match.pollClosed){
    if(!match.mvpPlayerId){
      return `<div style="font-size:12px; color:rgba(22,24,28,0.5); margin-top:8px;">MVP voting closed - no votes were cast.</div>`;
    }
    return `
      <div class="mvp-badge" style="margin-top:10px; padding:8px 12px; background:var(--amber); border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
        <span style="font-size:16px;">🏆</span>
        <span style="font-size:13px; font-weight:600; color:#0F2A38;">Match MVP: ${escapeHtml(nameOf(match.mvpPlayerId))}</span>
      </div>
    `;
  }

  const allPlayerIds = [...match.teamA.players, ...match.teamB.players];
  const myPlayerId = getMyOwnedPlayerId();
  const iCanVote = canVoteOnMatch(match);
  const myVote = state.currentUser ? votes[state.currentUser.uid] : null;

  const progress = `<div style="font-size:11px; font-family:'Space Mono',monospace; color:rgba(22,24,28,0.5); margin-top:10px;">MVP voting: ${voteCount}/${VOTES_TO_CLOSE} votes</div>`;

  let body;
  if(!iCanVote){
    body = `<div style="font-size:12px; color:rgba(22,24,28,0.45); margin-top:4px;">Only players who were in this match can vote.</div>`;
  }else{
    body = `
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
        ${allPlayerIds.filter(id => id !== myPlayerId).map(id => `
          <button type="button" class="secondary mvp-vote-btn${myVote === id ? ' mvp-voted' : ''}" data-vote-match="${match.id}" data-vote-player="${id}" style="width:auto; ${myVote === id ? 'background:var(--turf); color:#fff; border-color:var(--turf);' : ''}">
            ${escapeHtml(nameOf(id))}
          </button>
        `).join('')}
      </div>
      ${myVote ? `<div style="font-size:11px; color:rgba(22,24,28,0.5); margin-top:6px;">You voted for ${escapeHtml(nameOf(myVote))} - tap another name to change your vote.</div>` : ''}
    `;
  }

  const adminClose = state.isAdmin
    ? `<button type="button" class="ghost" data-force-close-vote="${match.id}" style="margin-top:8px;">Close voting now (admin)</button>`
    : '';

  return `<div class="mvp-section">${progress}${body}${adminClose}</div>`;
}

export function initMvpVoting(container){
  container.addEventListener('click', async (e) => {
    const voteBtn = e.target.closest('[data-vote-player]');
    if(voteBtn){
      e.stopImmediatePropagation();
      await castVote(voteBtn.getAttribute('data-vote-match'), voteBtn.getAttribute('data-vote-player'));
      return;
    }
    const closeBtn = e.target.closest('[data-force-close-vote]');
    if(closeBtn){
      e.stopImmediatePropagation();
      await forceCloseVoting(closeBtn.getAttribute('data-force-close-vote'));
      return;
    }
  });
}
