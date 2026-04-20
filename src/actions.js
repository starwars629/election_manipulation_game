'use strict';

// ── Player Actions ────────────────────────────────────────────────────────────
//
// Each action:
//   available(pollCard, gs) → bool
//   apply(pollCard, gs)     → string  (log message)
//
// "apply" mutates pollCard.displayedRanking and, when the poll is real,
// also mutates the linked ballot's ranking.
//
// The caller is responsible for deducting the budget cost.

/**
 * Look up the ballot linked to a real poll card.
 * Returns null if the card is fake or the ballot can't be found.
 */
function linkedBallot(pollCard, gs) {
  if (pollCard.isFake || !pollCard.linkedBallotId) return null;
  return gs.ballots.find(b => b.id === pollCard.linkedBallotId) ?? null;
}

/** Apply the same index-swap to an array, with bounds check. */
function swap(arr, i, j) {
  if (i >= 0 && i < arr.length && j >= 0 && j < arr.length) {
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Action definitions ────────────────────────────────────────────────────────

export const PLAYER_ACTIONS = [

  {
    id:   'move-alice-up',
    name: 'Move Alice up',
    desc: 'Raises Alice one rank in this ballot',
    emoji: '↑',
    cost: 50,

    available(pollCard) {
      if (pollCard.removed)        return false;
      if (pollCard.wasManipulated) return false;
      return pollCard.displayedRanking.indexOf('alice') > 0;
    },

    apply(pollCard, gs) {
      const idx = pollCard.displayedRanking.indexOf('alice');
      swap(pollCard.displayedRanking, idx - 1, idx);
      pollCard.wasManipulated = true;

      const ballot = linkedBallot(pollCard, gs);
      if (ballot) {
        const bi = ballot.ranking.indexOf('alice');
        swap(ballot.ranking, bi - 1, bi);
        return `${pollCard.id}: Alice moved up (real ballot updated).`;
      }
      return `${pollCard.id}: Alice moved up (poll was fake — no ballot changed).`;
    },
  },

  {
    id:   'move-alice-first',
    name: 'Alice to #1',
    desc: 'Sets Alice as the first choice in this ballot',
    emoji: '★',
    cost: 120,

    available(pollCard) {
      if (pollCard.removed)        return false;
      if (pollCard.wasManipulated) return false;
      return pollCard.displayedRanking.indexOf('alice') > 0;
    },

    apply(pollCard, gs) {
      const idx = pollCard.displayedRanking.indexOf('alice');
      pollCard.displayedRanking.splice(idx, 1);
      pollCard.displayedRanking.unshift('alice');
      pollCard.wasManipulated = true;

      const ballot = linkedBallot(pollCard, gs);
      if (ballot) {
        const bi = ballot.ranking.indexOf('alice');
        ballot.ranking.splice(bi, 1);
        ballot.ranking.unshift('alice');
        return `${pollCard.id}: Alice moved to #1 (real ballot updated).`;
      }
      return `${pollCard.id}: Alice to #1 (poll was fake — no ballot changed).`;
    },
  },

  {
    id:   'drop-rival',
    name: 'Drop rival down',
    desc: "Demotes the poll's 1st-choice rival one rank",
    emoji: '↓',
    cost: 50,

    available(pollCard) {
      if (pollCard.removed)        return false;
      if (pollCard.wasManipulated) return false;
      // Only available when Alice is NOT the displayed leader
      return pollCard.displayedRanking[0] !== 'alice';
    },

    apply(pollCard, gs) {
      const rival = pollCard.displayedRanking[0];
      // Swap positions 0 and 1 in the display ranking
      swap(pollCard.displayedRanking, 0, 1);
      pollCard.wasManipulated = true;

      const ballot = linkedBallot(pollCard, gs);
      if (ballot) {
        const ri = ballot.ranking.indexOf(rival);
        swap(ballot.ranking, ri, ri + 1);
        return `${pollCard.id}: ${rival} demoted (real ballot updated).`;
      }
      return `${pollCard.id}: ${rival} demoted (poll was fake — no ballot changed).`;
    },
  },

  {
    id:   'remove-ballot',
    name: 'Remove ballot',
    desc: 'Removes this voter from the electorate (max 2 per round)',
    emoji: '✕',
    cost: 200,

    available(pollCard, gs) {
      if (pollCard.removed)        return false;
      if (pollCard.wasManipulated) return false;
      // Don't allow removal when Alice already leads — would only hurt Alice
      if (pollCard.displayedRanking[0] === 'alice') return false;
      return gs.removalsUsed < 2;
    },

    apply(pollCard, gs) {
      pollCard.removed = true;
      pollCard.wasManipulated = true;
      gs.removalsUsed++;

      const ballot = linkedBallot(pollCard, gs);
      if (ballot) {
        ballot.removed = true;
        return `${pollCard.id}: ballot removed from electorate (real).`;
      }
      return `${pollCard.id}: removal attempted (poll was fake — no ballot removed).`;
    },
  },
];
