'use strict';

import { makePollCard } from './models.js';

// ── Poll generation ───────────────────────────────────────────────────────────
//
// Spec algorithm (section 4):
//   1. pollCount varies by round: R1=10, R2=15, R3=20  (curated=20)
//   2. minReal = floor(accuracy × pollCount)
//   3. Assign minReal guaranteed-real polls to randomly chosen ballots
//   4. Fill remaining slots: real (prob=accuracy) if unused ballots remain, else fake
//   5. Shuffle final array so player can't infer real/fake from position

const CAND_IDS = ['alice', 'bob', 'carol'];

/** Fisher–Yates shuffle (in-place). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Generate a random ranking of the three candidates. */
function randomRanking() {
  return shuffle([...CAND_IDS]);
}

/**
 * Generate poll cards for the current round.
 *
 * @param {object[]} ballots     Full ballot array (25 items, may have mutations from prior rounds)
 * @param {number}   accuracy    0–1 (e.g. 0.6)
 * @param {number}   pollCount   Total poll cards to produce (10 | 15 | 20)
 * @returns {PollCard[]}
 */
export function generatePolls(ballots, accuracy, pollCount) {
  const polls = [];

  // Pool of ballot indices that haven't been linked to a poll card yet
  const unlinked = shuffle(
    ballots
      .filter(b => !b.removed)
      .map(b => b.id)
  );

  // How many real polls are guaranteed
  const minReal = Math.floor(accuracy * pollCount);

  let pollId = 0;

  // Step 1: Guaranteed real polls
  for (let i = 0; i < minReal && unlinked.length > 0; i++) {
    const ballotId = unlinked.shift();
    const ballot = ballots.find(b => b.id === ballotId);
    polls.push(makePollCard(
      `p${String(pollId++).padStart(2, '0')}`,
      [...ballot.ranking],
      ballotId,
      false
    ));
  }

  // Step 2: Remaining slots — real or fake by probability
  const remaining = pollCount - polls.length;
  for (let i = 0; i < remaining; i++) {
    const goReal = Math.random() < accuracy && unlinked.length > 0;
    if (goReal) {
      const ballotId = unlinked.shift();
      const ballot = ballots.find(b => b.id === ballotId);
      polls.push(makePollCard(
        `p${String(pollId++).padStart(2, '0')}`,
        [...ballot.ranking],
        ballotId,
        false
      ));
    } else {
      polls.push(makePollCard(
        `p${String(pollId++).padStart(2, '0')}`,
        randomRanking(),
        null,
        true
      ));
    }
  }

  // Step 3: Shuffle so real/fake position carries no information
  return shuffle(polls);
}
