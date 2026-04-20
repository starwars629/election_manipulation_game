'use strict';

// ── USA tile-map layout ───────────────────────────────────────────────────────
// 12-column × 8-row CSS grid (1-indexed).
// Districts = how many campaign games decide this state.

export const STATES = [
  // Row 1
  { id:'AK', name:'Alaska',          row:1, col:1,  districts:1 },
  { id:'VT', name:'Vermont',         row:1, col:11, districts:1 },
  { id:'ME', name:'Maine',           row:1, col:12, districts:1 },
  // Row 2
  { id:'WA', name:'Washington',      row:2, col:1,  districts:2 },
  { id:'MT', name:'Montana',         row:2, col:2,  districts:1 },
  { id:'ND', name:'North Dakota',    row:2, col:3,  districts:1 },
  { id:'MN', name:'Minnesota',       row:2, col:4,  districts:2 },
  { id:'WI', name:'Wisconsin',       row:2, col:5,  districts:2 },
  { id:'MI', name:'Michigan',        row:2, col:6,  districts:2 },
  { id:'NH', name:'New Hampshire',   row:2, col:11, districts:1 },
  // Row 3
  { id:'OR', name:'Oregon',          row:3, col:1,  districts:1 },
  { id:'ID', name:'Idaho',           row:3, col:2,  districts:1 },
  { id:'WY', name:'Wyoming',         row:3, col:3,  districts:1 },
  { id:'SD', name:'South Dakota',    row:3, col:4,  districts:1 },
  { id:'IA', name:'Iowa',            row:3, col:5,  districts:1 },
  { id:'IL', name:'Illinois',        row:3, col:6,  districts:2 },
  { id:'IN', name:'Indiana',         row:3, col:7,  districts:2 },
  { id:'OH', name:'Ohio',            row:3, col:8,  districts:2 },
  { id:'PA', name:'Pennsylvania',    row:3, col:9,  districts:2 },
  { id:'NY', name:'New York',        row:3, col:10, districts:2 },
  { id:'MA', name:'Massachusetts',   row:3, col:11, districts:1 },
  { id:'RI', name:'Rhode Island',    row:3, col:12, districts:1 },
  // Row 4
  { id:'CA', name:'California',      row:4, col:1,  districts:2 },
  { id:'NV', name:'Nevada',          row:4, col:2,  districts:1 },
  { id:'CO', name:'Colorado',        row:4, col:3,  districts:2 },
  { id:'NE', name:'Nebraska',        row:4, col:4,  districts:1 },
  { id:'MO', name:'Missouri',        row:4, col:5,  districts:2 },
  { id:'KY', name:'Kentucky',        row:4, col:6,  districts:1 },
  { id:'WV', name:'West Virginia',   row:4, col:7,  districts:1 },
  { id:'VA', name:'Virginia',        row:4, col:8,  districts:2 },
  { id:'MD', name:'Maryland',        row:4, col:9,  districts:2 },
  { id:'NJ', name:'New Jersey',      row:4, col:10, districts:2 },
  { id:'CT', name:'Connecticut',     row:4, col:11, districts:1 },
  // Row 5
  { id:'AZ', name:'Arizona',         row:5, col:2,  districts:2 },
  { id:'UT', name:'Utah',            row:5, col:3,  districts:1 },
  { id:'KS', name:'Kansas',          row:5, col:4,  districts:1 },
  { id:'AR', name:'Arkansas',        row:5, col:5,  districts:1 },
  { id:'TN', name:'Tennessee',       row:5, col:6,  districts:2 },
  { id:'NC', name:'North Carolina',  row:5, col:7,  districts:2 },
  { id:'SC', name:'South Carolina',  row:5, col:8,  districts:1 },
  { id:'DE', name:'Delaware',        row:5, col:9,  districts:1 },
  // Row 6
  { id:'NM', name:'New Mexico',      row:6, col:3,  districts:1 },
  { id:'OK', name:'Oklahoma',        row:6, col:4,  districts:1 },
  { id:'LA', name:'Louisiana',       row:6, col:5,  districts:1 },
  { id:'MS', name:'Mississippi',     row:6, col:6,  districts:1 },
  { id:'AL', name:'Alabama',         row:6, col:7,  districts:1 },
  { id:'GA', name:'Georgia',         row:6, col:8,  districts:2 },
  // Row 7
  { id:'TX', name:'Texas',           row:7, col:4,  districts:2 },
  { id:'FL', name:'Florida',         row:7, col:8,  districts:2 },
  // Row 8
  { id:'HI', name:'Hawaii',          row:8, col:1,  districts:1 },
];

export const STATE_BY_ID = Object.fromEntries(STATES.map(s => [s.id, s]));

// ── Result helpers ────────────────────────────────────────────────────────────

/**
 * Return the winner of a state given its played district results array,
 * or null if no districts have been played yet.
 * Tie-break: Alice wins over any other candidate.
 */
export function stateWinner(districtResults) {
  if (!districtResults) return null;
  const counts = {};
  for (const w of districtResults) {
    if (w) counts[w] = (counts[w] || 0) + 1;
  }
  if (Object.keys(counts).length === 0) return null;
  const max = Math.max(...Object.values(counts));
  const tied = Object.entries(counts).filter(([, v]) => v === max).map(([k]) => k);
  if (tied.length === 1) return tied[0];
  return tied.includes('alice') ? 'alice' : tied[0];
}

/**
 * Count how many states each candidate has won.
 * Returns { alice: N, bob: N, carol: N, unplayed: N }
 */
export function nationalScores(results) {
  const scores = { alice: 0, bob: 0, carol: 0, unplayed: 0 };
  for (const state of STATES) {
    const w = stateWinner(results[state.id]);
    if (w) scores[w] = (scores[w] || 0) + 1;
    else   scores.unplayed++;
  }
  return scores;
}

/**
 * Return the national leader (most state wins), or null if no states played.
 */
export function nationalLeader(results) {
  const s = nationalScores(results);
  const played = STATES.filter(st => stateWinner(results[st.id]) !== null);
  if (played.length === 0) return null;
  const max = Math.max(s.alice, s.bob, s.carol);
  if (s.alice === max) return 'alice';
  if (s.bob   === max) return 'bob';
  return 'carol';
}
