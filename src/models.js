'use strict';

// ── Candidates ────────────────────────────────────────────────────────────────

export const CANDIDATES = [
  { id: 'alice', name: 'Alice', color: '#7d76db', cssVar: 'var(--alice)', isPlayer: true  },
  { id: 'bob',   name: 'Bob',   color: '#d95a2f', cssVar: 'var(--bob)',   isPlayer: false },
  { id: 'carol', name: 'Carol', color: '#2ead7a', cssVar: 'var(--carol)', isPlayer: false },
];

export const CAND_BY_ID = Object.fromEntries(CANDIDATES.map(c => [c.id, c]));

// ── Initial ballot distribution (25 ballots, Bob wins comfortably) ────────────
// Plurality: Bob=13, Carol=8, Alice=4
// Borda:     Bob=32, Carol=27, Alice=16
// IRV:       Alice eliminated R1 → Bob wins R2

export const BALLOT_BLOCS = [
  { ranking: ['bob',   'carol', 'alice'], count: 8 },
  { ranking: ['bob',   'alice', 'carol'], count: 5 },
  { ranking: ['carol', 'bob',   'alice'], count: 5 },
  { ranking: ['carol', 'alice', 'bob'],   count: 3 },
  { ranking: ['alice', 'carol', 'bob'],   count: 2 },
  { ranking: ['alice', 'bob',   'carol'], count: 2 },
];

// ── Constructors ──────────────────────────────────────────────────────────────

/**
 * @param {string} id
 * @param {string[]} ranking  e.g. ['bob','carol','alice']
 * @returns {Ballot}
 */
export function makeBallot(id, ranking) {
  return {
    id,
    ranking:         [...ranking],
    originalRanking: [...ranking],  // never mutated — used for baseline comparison
    removed:         false,
  };
}

/**
 * @param {string}      id
 * @param {string[]}    displayedRanking
 * @param {string|null} linkedBallotId   null → fake poll
 * @param {boolean}     isFake
 * @returns {PollCard}
 */
export function makePollCard(id, displayedRanking, linkedBallotId, isFake) {
  return {
    id,
    displayedRanking:         [...displayedRanking],
    originalDisplayedRanking: [...displayedRanking],  // for reveal comparison
    linkedBallotId,
    isFake,
    wasManipulated: false,
    removed:        false,
  };
}
