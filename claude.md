# CLAUDE.md

## Project: Election Manipulation Card Game

---

## 1. Overview

This is a **single-player, web-based strategy card game** where the player manipulates polling data to influence election outcomes.

The player:

* Sees **poll cards** (imperfect information)
* Spends a **limited budget** to manipulate them
* Attempts to make their candidate win under multiple voting systems

Core tension:

> Not all polls reflect reality. Manipulating the wrong ones wastes resources.

---

## 2. Core Constraints (DO NOT VIOLATE)

* Exactly **3 candidates**
* Exactly **25 ballots per game**
* Polls map **1-to-1 to ballots OR are fake**
* No probabilistic influence beyond poll accuracy
* No additional mechanics beyond those specified
* No multiplayer
* No backend required (pure frontend app)

---

## 3. Data Models

### Candidate

```js
{
  id: string,
  name: string,
  color: string,
  isPlayer: boolean
}
```

---

### Ballot (Ground Truth)

```js
{
  id: string,
  ranking: [candidateId, candidateId, candidateId],
  removed: boolean
}
```

---

### PollCard (Visible to Player)

```js
{
  id: string,
  displayedRanking: [candidateId, candidateId, candidateId],
  linkedBallotId: string | null,
  isFake: boolean,
  wasManipulated: boolean
}
```

---

### GameState

```js
{
  mode: "curated" | "campaign",
  round: number,
  budget: number,
  candidates: Candidate[],
  ballots: Ballot[],
  polls: PollCard[],
  accuracy: number,
  removalsUsed: number
}
```

---

## 4. Poll Generation Logic

Given:

* 25 ballots
* Accuracy value (0–1)

### Rules

* Minimum real polls:

  ```
  floor(accuracy × pollCount)
  ```

### Steps:

1. Determine poll count:

   * Round 1: 10
   * Round 2: 15
   * Round 3: 20

2. Assign real polls first (guaranteed minimum)

3. Fill remaining polls:

   * Real with probability = accuracy
   * Otherwise fake

4. Fake poll generation:

   * Generate randomized rankings
   * Slight bias toward uniform randomness

---

## 5. Player Actions

Each action:

* Updates **displayedRanking**
* If poll is real → applies same transformation to ballot

### Actions + Costs

* Move Candidate Up 1 — $50
* Move Candidate to Rank 1 — $120
* Drop Rival Down 1 — $50
* Remove Ballot — $200

---

### Constraints

* Max **2 ballot removals per round**

---

### Action Rules

#### Move Up 1

Swap candidate with the one above.

#### Move to Rank 1

Move candidate to index 0, shift others down.

#### Drop Rival 1

Swap with candidate below.

#### Remove Ballot

* If real → set `removed = true`
* If fake → no effect

---

## 6. Voting Systems

### Plurality

* Count first-choice votes
* Highest wins

---

### Borda Count

* Rank 1 = 2 points
* Rank 2 = 1 point
* Rank 3 = 0 points

---

### IRV (Instant Runoff)

Loop:

1. Count first-choice votes
2. If majority → winner
3. Eliminate lowest candidate
4. Redistribute ballots
5. Repeat

---

### Tie-breaking Rule (ALL SYSTEMS)

1. Compare first-place votes
2. If still tied:

   * If player candidate is tied → player wins
   * Otherwise → player loses

---

## 7. Game Modes

---

### Curated Mode

* Single round
* Player selects accuracy (0.4–0.9)
* Budget = $1000

---

### Campaign Mode

#### Rounds

* Round 1: 40% accuracy, $1000
* Round 2: 60% accuracy, $750
* Round 3: 80% accuracy, $500

#### Rules

* Budget resets each round
* Ballots persist across rounds
* Manipulations persist across rounds
* Polls regenerate each round

---

## 8. Feedback System

### During Game

* Show **poll-based leader**
* Update after each action

---

### Endgame Reveal

Display:

* Real vs fake polls
* Which manipulations affected real ballots
* Number of effective vs wasted actions
* Original vs final ballot states
* Results under:

  * Plurality
  * Borda
  * IRV

---

### IRV Explanation

Show elimination rounds step-by-step.

---

### Borda Explanation

Display note:

> “Borda rewards consistent ranking, not just first-place votes.”

---

## 9. Strategy Transparency (Level-Up Features)

### Baseline Comparison

* Show outcome if player made **no changes**

### System Comparison

* Highlight when voting systems produce different winners

---

## 10. UI Requirements

### Layout

* Poll cards in grid
* Each shows ranking + action buttons

### HUD

* Budget
* Round
* Mode
* Poll-based leader

### Visual Feedback

* Highlight manipulated cards
* Color-coded candidates
* Endgame reveal visuals

---

## 11. Architecture

### Suggested File Structure

```
/src
  /models
  /logic
  /ui
  main.js
  gameState.js
```

---

## 12. Build Phases (MANDATORY ORDER)

1. Data models + ballot generation
2. Voting systems (fully tested)
3. Poll generation
4. Action system
5. Basic UI
6. Game modes
7. Feedback + endgame reveal
8. UI polish

---

## 13. Constraints & Guardrails

* Do NOT introduce new mechanics
* Do NOT modify voting rules
* No external APIs
* Keep logic separate from UI
* Avoid large monolithic files

---

## 14. USA-Style Simulation (Abstracted)

This is a **3-candidate national simulation**, not real-world accurate.

### Structure

* Each game = one “district”
* All districts use same 3 candidates
* Results combine into a final election

---

### Input JSON

```json
{
  "districtId": "string",
  "ballots": [...],
  "candidates": [...]
}
```

---

### Output JSON

```json
{
  "districtId": "string",
  "winner": "candidateId",
  "results": {
    "plurality": "...",
    "borda": "...",
    "irv": "..."
  },
  "played": true
}
```

---

### Aggregation Concept

* Combine district winners
* Determine national winner

---

## 15. Definition of Done

The game is complete when:

* Voting systems produce correct results
* Manipulations correctly affect real ballots only
* Fake polls correctly waste budget
* Campaign mode progression works
* Endgame clearly explains outcomes
* Baseline comparison works
* No placeholder logic remains

---
