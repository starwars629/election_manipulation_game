'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return active (non-removed) ballots */
function active(ballots) {
  return ballots.filter(b => !b.removed);
}

/**
 * Count first-choice votes for each candidate.
 * @param {object[]} ballots
 * @param {string[]} alive  - candidates still in contention
 */
function firstChoiceCounts(ballots, alive) {
  const counts = Object.fromEntries(alive.map(c => [c, 0]));
  for (const b of ballots) {
    const top = b.ranking.find(c => alive.includes(c));
    if (top) counts[top]++;
  }
  return counts;
}

/**
 * Resolve a winner from a scores map, applying the spec tie-breaking rules:
 *   1. Highest score wins outright.
 *   2. Tie → compare first-choice vote counts.
 *   3. Still tied → Alice wins if she's in the tie; otherwise first in list.
 *
 * @param {{ [id: string]: number }} scores
 * @param {{ [id: string]: number }} fc    first-choice counts
 * @param {string[]}                 cands
 * @returns {string} winning candidate id
 */
function resolveWinner(scores, fc, cands) {
  const maxScore = Math.max(...cands.map(c => scores[c]));
  let tied = cands.filter(c => scores[c] === maxScore);

  if (tied.length === 1) return tied[0];

  // Tie-break 1: first-choice votes
  const maxFC = Math.max(...tied.map(c => fc[c]));
  tied = tied.filter(c => fc[c] === maxFC);

  if (tied.length === 1) return tied[0];

  // Tie-break 2: player (Alice) wins
  return tied.includes('alice') ? 'alice' : tied[0];
}

// ── Plurality ─────────────────────────────────────────────────────────────────

/**
 * @param {object[]} ballots  (may include removed ones — filter internally)
 * @returns {{ scores: object, winner: string }}
 */
export function computePlurality(ballots) {
  const live = active(ballots);
  const cands = ['alice', 'bob', 'carol'];
  const scores = Object.fromEntries(cands.map(c => [c, 0]));

  for (const b of live) {
    scores[b.ranking[0]]++;
  }

  const fc = { ...scores }; // plurality scores === first-choice counts
  return { scores, winner: resolveWinner(scores, fc, cands) };
}

// ── Borda Count ───────────────────────────────────────────────────────────────
// Spec: Rank 1 = 2pts, Rank 2 = 1pt, Rank 3 = 0pts

/**
 * @param {object[]} ballots
 * @returns {{ scores: object, winner: string }}
 */
export function computeBorda(ballots) {
  const live = active(ballots);
  const cands = ['alice', 'bob', 'carol'];
  const scores = Object.fromEntries(cands.map(c => [c, 0]));
  const POINTS = [2, 1, 0];

  for (const b of live) {
    b.ranking.forEach((cid, i) => { scores[cid] += POINTS[i] ?? 0; });
  }

  const fc = firstChoiceCounts(live, cands);
  return { scores, winner: resolveWinner(scores, fc, cands) };
}

// ── IRV (Instant Runoff) ──────────────────────────────────────────────────────

/**
 * Run IRV and return winner + step-by-step elimination log.
 *
 * @param {object[]} ballots
 * @returns {{ winner: string, steps: object[] }}
 *
 * Each step: { round, counts: {id: n}, alive: string[], eliminated: string|null, winner: string|null }
 */
export function computeIRV(ballots) {
  const live = active(ballots);
  const cands = ['alice', 'bob', 'carol'];
  let alive = [...cands];
  const steps = [];
  let round = 1;

  while (alive.length > 1) {
    const counts = firstChoiceCounts(live, alive);
    const total = alive.reduce((s, c) => s + counts[c], 0);
    const step = { round, counts: { ...counts }, alive: [...alive], eliminated: null, winner: null };

    // Check for majority
    const leader = alive.reduce((a, b) => counts[a] >= counts[b] ? a : b);
    if (counts[leader] > total / 2) {
      step.winner = leader;
      steps.push(step);
      return { winner: leader, steps };
    }

    // Eliminate lowest; Alice gets tie-break protection
    const minVotes = Math.min(...alive.map(c => counts[c]));
    const atMin = alive.filter(c => counts[c] === minVotes);

    let toElim;
    if (atMin.length === 1) {
      toElim = atMin[0];
    } else if (atMin.includes('alice')) {
      // Alice has tie-break protection — eliminate the non-Alice candidate
      toElim = atMin.find(c => c !== 'alice');
    } else {
      toElim = atMin[0]; // arbitrary among non-Alice tied candidates
    }

    step.eliminated = toElim;
    steps.push(step);
    alive = alive.filter(c => c !== toElim);
    round++;
  }

  // Last candidate standing
  const winner = alive[0];
  const counts = firstChoiceCounts(live, alive);
  steps.push({ round, counts, alive: [...alive], eliminated: null, winner });
  return { winner, steps };
}

// ── Run all methods ───────────────────────────────────────────────────────────

/**
 * Compute results under all three voting methods.
 * @param {object[]} ballots
 * @returns {{ plurality: object, borda: object, irv: object }}
 */
export function computeAllMethods(ballots) {
  return {
    plurality: computePlurality(ballots),
    borda:     computeBorda(ballots),
    irv:       computeIRV(ballots),
  };
}
