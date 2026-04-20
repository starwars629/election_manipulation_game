'use strict';

import { BALLOT_BLOCS, makeBallot } from './models.js';
import { generatePolls }            from './pollGen.js';
import { PLAYER_ACTIONS }           from './actions.js';
import { computeAllMethods }        from './voting.js';

// ── Configuration ─────────────────────────────────────────────────────────────

export const CAMPAIGN_ROUNDS = [
  { round: 1, accuracy: 0.4, budget: 1000, pollCount: 10, name: 'Early Campaign'  },
  { round: 2, accuracy: 0.6, budget: 750,  pollCount: 15, name: 'Mid-Campaign'    },
  { round: 3, accuracy: 0.8, budget: 500,  pollCount: 20, name: 'Election Eve'    },
];

export const CURATED_DEFAULTS = {
  accuracy:  0.6,
  budget:    1000,
  pollCount: 20,
  minAcc:    0.4,
  maxAcc:    0.9,
};

export const METHODS = ['plurality', 'borda', 'irv'];
export const METHOD_DESC = {
  plurality: 'Most first-place votes wins. Winner-take-all.',
  borda:     'Rank 1 = 2 pts, Rank 2 = 1 pt, Rank 3 = 0 pts. Rewards consistent ranking.',
  irv:       'Eliminate the last-place candidate each round, redistribute their votes. Repeat until majority.',
};

// ── Mutable game state ────────────────────────────────────────────────────────
// Exported as a plain object — consumers read it, only the functions below write it.

export const GS = {
  mode:          'curated',    // 'curated' | 'campaign' | 'usa'
  round:         1,
  method:        'plurality',

  ballots:       [],           // Ballot[]  — ground truth, 25 items
  polls:         [],           // PollCard[] — what the player sees

  accuracy:      0.6,
  budget:        1000,
  spent:         0,            // cumulative across all rounds (campaign) or single round (curated)
  removalsUsed:  0,

  over:          false,
  trueResults:   null,         // set when election is run
  baselineResults: null,       // set when election is run

  // These persist into the feedback screen
  effectiveActions: 0,
  wastedActions:    0,
};

// ── Ballot generation ─────────────────────────────────────────────────────────

function buildBallots() {
  const out = [];
  let n = 0;
  for (const { ranking, count } of BALLOT_BLOCS) {
    for (let i = 0; i < count; i++) {
      out.push(makeBallot(`b${String(n++).padStart(2, '0')}`, ranking));
    }
  }
  return out; // exactly 25
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise (or reset) the game for the given mode.
 * @param {'curated'|'campaign'|'usa'} mode
 */
export function initGame(mode = 'curated') {
  GS.mode         = mode;
  GS.round        = 1;
  GS.method       = 'plurality';
  GS.over         = false;
  GS.trueResults  = null;
  GS.baselineResults = null;
  GS.effectiveActions = 0;
  GS.wastedActions    = 0;

  GS.ballots = buildBallots();

  if (mode === 'campaign' || mode === 'usa') {
    const cfg = CAMPAIGN_ROUNDS[0];
    GS.accuracy      = cfg.accuracy;
    GS.budget        = cfg.budget;
    GS.polls         = generatePolls(GS.ballots, cfg.accuracy, cfg.pollCount);
  } else {
    GS.accuracy      = CURATED_DEFAULTS.accuracy;
    GS.budget        = CURATED_DEFAULTS.budget;
    GS.polls         = generatePolls(GS.ballots, GS.accuracy, CURATED_DEFAULTS.pollCount);
  }

  GS.spent        = 0;
  GS.removalsUsed = 0;
}

/**
 * Curated mode only — regenerate polls when the accuracy slider changes.
 * Ballot mutations from prior actions are preserved.
 * @param {number} newAccuracy  0.4–0.9
 */
export function setCuratedAccuracy(newAccuracy) {
  GS.accuracy = newAccuracy;
  GS.polls = generatePolls(GS.ballots, newAccuracy, CURATED_DEFAULTS.pollCount);
}

/**
 * Campaign mode — advance to the next round.
 * Polls regenerate; ballots and prior manipulations persist.
 */
export function advanceRound() {
  if ((GS.mode !== 'campaign' && GS.mode !== 'usa') || GS.round >= CAMPAIGN_ROUNDS.length) return;

  GS.round++;
  const cfg = CAMPAIGN_ROUNDS[GS.round - 1];
  GS.accuracy       = cfg.accuracy;
  GS.budget         = cfg.budget;   // budget resets each round per spec
  GS.removalsUsed   = 0;            // removal limit resets each round
  GS.polls          = generatePolls(GS.ballots, cfg.accuracy, cfg.pollCount);
}

/**
 * Execute a named action against a specific poll card.
 * @param {string} actionId    e.g. 'move-alice-up'
 * @param {string} pollCardId  e.g. 'p03'
 * @returns {string|null}  log message, or null if action couldn't execute
 */
export function executeAction(actionId, pollCardId) {
  if (GS.over) return null;

  const action = PLAYER_ACTIONS.find(a => a.id === actionId);
  if (!action) return null;

  const pollCard = GS.polls.find(p => p.id === pollCardId);
  if (!pollCard) return null;

  if (!action.available(pollCard, GS)) return null;
  if (GS.budget < action.cost) return null;

  GS.budget -= action.cost;
  GS.spent  += action.cost;

  const msg = action.apply(pollCard, GS);
  return msg;
}

/**
 * Lock the game and compute true election results.
 * @returns {{ trueResults: object, baselineResults: object }}
 */
export function runElection() {
  if (GS.over) return null;
  GS.over = true;

  // True results from current (possibly mutated) ballots
  GS.trueResults = computeAllMethods(GS.ballots);

  // Baseline: what would have happened with no player changes at all
  const baselineBallots = GS.ballots.map(b => ({
    ...b,
    ranking: [...b.originalRanking],
    removed: false,
  }));
  GS.baselineResults = computeAllMethods(baselineBallots);

  // Count effective vs wasted manipulations
  GS.effectiveActions = 0;
  GS.wastedActions    = 0;
  for (const poll of GS.polls) {
    if (!poll.wasManipulated) continue;
    if (poll.isFake || !poll.linkedBallotId) {
      GS.wastedActions++;
    } else {
      GS.effectiveActions++;
    }
  }

  return { trueResults: GS.trueResults, baselineResults: GS.baselineResults };
}
