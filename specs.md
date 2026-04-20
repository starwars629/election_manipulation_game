# Election Manipulation Game — Specification

## Overview

A browser-based educational game for a presentation on election manipulation. The player is assigned the role of a campaign operative for **Alice**. They are shown noisy poll results and must spend a limited budget to manipulate individual ballots so that Alice wins the true election when it is run.

The core tension: the poll results shown to the player may not reflect the true election state (controlled by an accuracy slider), so manipulation actions cost real money but may be wasted if the poll was wrong about that voter.

---

## File Structure

```
index.html    — markup only, links to style.css and game.js
style.css     — all styles
game.js       — all game logic
```

---

## Game State

### True electorate (`state.truePrefs`)
An array of 66 ballots. Each ballot is an ordered array of candidate names representing one voter's full ranked preference, e.g. `['Bob', 'Carol', 'Alice']`. This is the ground truth — hidden from the player.

### Poll (`state.pollPrefs`)
An array of 66 ballots derived from `state.truePrefs` by applying noise. For each ballot, with probability `(1 - accuracy/100)` two random positions in the ranking are swapped. This is what the player sees. The poll index corresponds 1-to-1 with the true ballot index (ballot 0 in poll = ballot 0 in truth).

### Starting distribution (Bob wins comfortably, Alice is in 3rd)
| Bloc | Count | Ballot |
|------|-------|--------|
| Bob strong | 22 | `['Bob','Carol','Alice']` |
| Bob secondary | 15 | `['Bob','Alice','Carol']` |
| Carol mid | 11 | `['Carol','Bob','Alice']` |
| Carol secondary | 7 | `['Carol','Alice','Bob']` |
| Alice small | 6 | `['Alice','Carol','Bob']` |
| Alice tiny | 5 | `['Alice','Bob','Carol']` |

### Other state fields
- `state.accuracy` — integer 0–100, default 75
- `state.budget` — integer, starts at 1000
- `state.spent` — integer, starts at 0
- `state.method` — string, one of `'plurality'|'borda'|'irv'|'approval'|'condorcet'`
- `state.cands` — array of candidate name strings, starts as `['Alice','Bob','Carol']`
- `state.over` — boolean, true after election is run

---

## UI Layout

```
┌─ Header ─────────────────────────────────────────────────┐
│ VOTE.EXE — Election Manipulation        [result banner]  │
└──────────────────────────────────────────────────────────┘

┌─ Accuracy panel ──┐  ┌─ Election results panel ─────────┐
│ Slider 0–100%     │  │ Method tabs (5 methods)           │
│ Noise indicator   │  │ Method description                │
│ Voter dot grid    │  │ Bar chart: score per candidate    │
│ Misread count     │  │ (the original bar chart format)   │
└───────────────────┘  └───────────────────────────────────┘

┌─ Poll ballots panel ──────────────────────────────────────┐
│ 66 clickable ballot cards, each showing the polled        │
│ ranked preference for that voter. Clicking selects it.   │
│ Selected ballot highlights and shows action panel.       │
└──────────────────────────────────────────────────────────┘

┌─ Action panel ──────────────┐  ┌─ Budget ───────────────┐
│ (empty until ballot selected│  │ $1000 remaining        │
│ shows actions for that      │  │ Progress bar           │
│ specific ballot)            │  ├────────────────────────┤
└─────────────────────────────┘  │ Action log             │
                                 └────────────────────────┘

[ ▶ RUN THE TRUE ELECTION ]
[ ↺ reset ]
```

---

## Poll Results Display (Election Results Panel)

Show a **bar chart** with one horizontal bar per candidate. The bar length represents the candidate's score under the currently selected voting method, computed from `state.pollPrefs`. Update live when the method tab changes or when an action is taken.

Label each bar with: candidate name (colored), the bar, and the numeric score. Mark the current poll leader with ★.

This is the same format as the very first version of the game.

---

## Poll Ballot Display

Show all 66 poll ballots as individual cards in a scrollable grid. Each card:
- Displays the full ranked preference from `state.pollPrefs[i]`, e.g.:
  ```
  1. Bob
  2. Carol
  3. Alice
  ```
- Is colored/accented by whoever is ranked 1st in the poll for that ballot
- Is clickable (selects the ballot, highlights it with an accent border)
- Shows a small "misread?" indicator (e.g. a dim `?` badge) if this ballot may be inaccurate — defined as: the poll 1st-choice differs from the true 1st-choice. This reveals to the player that some ballots might be wrong, without showing the true answer.

Only one ballot can be selected at a time. Clicking a selected ballot deselects it.

---

## Action Panel

When a ballot is selected, show a panel with available manipulation actions for **that specific ballot**. All actions operate on a single ballot at a time. 

### Actions

| Action | What it does | Base cost | Availability |
|--------|-------------|-----------|-------------|
| **Move Alice up** | Raises Alice one rank position in the true ballot at this index | $50 | Only if poll shows Alice not in 1st |
| **Move Alice to 1st** | Sets Alice to 1st in the true ballot at this index | $120 | Only if poll shows Alice not in 1st |
| **Push [rival] down** | Demotes the poll's 1st-place candidate one rank in the true ballot | $40 | Only if poll's 1st isn't Alice |
| **Suppress ballot** | Removes this ballot from the true electorate entirely | $80 | Only if poll's 1st isn't Alice |

### The poll inaccuracy mechanic (critical)

Actions are **always offered** if the poll shows they would be useful, even when the underlying true ballot may differ. The player pays the cost regardless of outcome. If the true ballot already has Alice in 1st (but the poll showed otherwise), the action still costs money but has no visible effect on the true electorate. This is the core mechanic: you are manipulating based on incomplete information.

**Do not reveal the true ballot to the player at any point before the election is run.**

### Cost display
Show the cost of each action. Disable the button if `state.budget < cost`. Show a brief description of what the action does.

---

## Voting Methods

Scores are always computed from whichever preference array is specified (poll or true):

### Plurality
Each ballot's 1st-choice candidate gets 1 point. Highest score wins.

### Borda Count
With N candidates, a 1st-place ranking earns N−1 points, 2nd earns N−2, ..., last earns 0. Sum points per candidate.

### Instant Runoff (IRV)
Repeatedly find the candidate with fewest 1st-choice votes and eliminate them. Removed candidates are skipped in remaining ballots. Repeat until one candidate remains.

### Approval Voting
Each voter "approves" their top 2 candidates. Each approval is 1 point. Highest total wins.

### Condorcet
For each pair (A, B): count how many ballots prefer A over B. If A beats every other candidate pairwise, A wins. If no Condorcet winner exists (cycle), fall back to Plurality.

---

## Accuracy Slider

- Range: 0–100, step 5, default 75
- On change: regenerate `state.pollPrefs` from `state.truePrefs` using the new accuracy value. Rerender ballot cards and bar chart.
- The voter dot visualization (small colored dots showing each voter's poll 1st choice, grayed out if misread) updates to reflect the new noise level.
- Regenerating polls does NOT reset manipulation actions already applied to `state.truePrefs`.

---

## Running the Election

When the player clicks "Run the True Election":
1. Compute scores from `state.truePrefs` (not the poll) using the selected method.
2. Show a result banner: win (Alice wins) or lose (another candidate wins).
3. Reveal the true ballot rankings in the ballot card grid (replace poll rankings with true rankings, mark which ones differed from the poll).
4. Lock all interaction.

---

## Scoring / Win Condition

Alice wins if she has the highest score in the true election under the selected method. The player's efficiency score is `(1 - spent/1000) * 100`%, shown on win. On loss, show who won and encourage a retry.

---

## Visual Design

- Dark theme: `#0f0f13` background, `#16161c` panels
- Fonts: Syne (headings/UI), DM Mono (labels/numbers)
- Candidate colors: Alice `#5b8fff`, Bob `#ff6b6b`, Carol `#4ecb7f`
- Accent (selection): `#a78bfa`
- Scanline overlay for aesthetic texture
- Smooth bar transitions (CSS `transition: width 0.4s ease`)