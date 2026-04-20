'use strict';

import { CANDIDATES, CAND_BY_ID }                        from './models.js';
import {
  GS, CAMPAIGN_ROUNDS, CURATED_DEFAULTS,
  METHOD_DESC, METHODS,
  executeAction, setCuratedAccuracy, advanceRound, runElection,
  initGame,
}                                                          from './gameState.js';
import { PLAYER_ACTIONS }                                  from './actions.js';
import { computeAllMethods }                               from './voting.js';
import { renderFeedback }                                  from './feedback.js';
import {
  USA_MAP, initUSAMode, startDistrict,
  recordDistrictResult, returnToMap,
}                                                          from './usaMode.js';
import {
  STATES, STATE_BY_ID, stateWinner, nationalScores, nationalLeader,
}                                                          from './usaData.js';

// ── UI-only state ─────────────────────────────────────────────────────────────

export const UI = {
  selectedPollId:  null,
  pollPrediction:  null,   // snapshot of poll-based results saved just before election runs
};

// ── Fixed deck slot order (3 candidates → 6 permutations) ────────────────────
// Grouped by first-choice: alice cols 1-2, bob cols 3-4, carol cols 5-6
const RANKING_SLOTS = [
  ['alice', 'bob',   'carol'],
  ['alice', 'carol', 'bob'  ],
  ['bob',   'alice', 'carol'],
  ['bob',   'carol', 'alice'],
  ['carol', 'alice', 'bob'  ],
  ['carol', 'bob',   'alice'],
];

const CAND_HEADERS = [
  { id: 'alice', label: 'Alice first' },
  { id: 'bob',   label: 'Bob first'   },
  { id: 'carol', label: 'Carol first' },
];

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderAll() {
  renderControls();

  // Breadcrumb: only during USA district play
  const isUSADistrict = GS.mode === 'usa' && USA_MAP.view === 'district';
  const existingBc = document.getElementById('district-breadcrumb');
  if (!isUSADistrict && existingBc) existingBc.remove();

  const isUSAMapView = GS.mode === 'usa' && USA_MAP.view === 'map';

  // Toggle between USA map and normal game UI
  document.querySelector('.main-layout').style.display     = isUSAMapView ? 'none' : '';
  document.getElementById('usa-map-view').style.display    = isUSAMapView ? ''     : 'none';
  document.getElementById('results-preview').style.display = isUSAMapView ? 'none' : '';
  document.getElementById('poll-standings').style.display  = isUSAMapView ? 'none' : '';

  if (isUSAMapView) {
    renderUSAMap();
    renderRunButton();
    return;
  }

  // Normal game UI
  renderPollGrid();
  renderPollStandings();
  renderResultsPreview();
  renderActionPanel();
  renderBudget();
  renderRunButton();
}

// ── Controls row ──────────────────────────────────────────────────────────────

function renderControls() {
  renderModeSelector();
  renderRoundOrAccuracy();
  renderMethodSelector();
  renderHUDLeader();
  renderSubtitle();
}

function renderSubtitle() {
  const el = document.querySelector('.subtitle');
  if (!el) return;
  if (GS.mode === 'usa' && USA_MAP.view === 'map') {
    el.innerHTML = 'Playing as <strong>Alice</strong> · capture districts · win states · dominate the nation';
  } else if (GS.mode === 'usa' && USA_MAP.view === 'district') {
    const state = STATE_BY_ID[USA_MAP.activeStateId];
    el.innerHTML = `Playing as <strong>Alice</strong> · ${state?.name || ''} District ${USA_MAP.districtIndex + 1} · plurality vote`;
  } else {
    el.innerHTML = 'Playing as <strong>Alice</strong> · manipulate polls to win · not all polls are real';
  }
}

function renderModeSelector() {
  const el = document.getElementById('mode-selector');
  el.innerHTML = '';
  const modes = [
    { id: 'curated',  label: 'Classic'       },
    { id: 'campaign', label: 'Campaign Trail' },
    { id: 'usa',      label: 'USA Map'        },
  ];
  modes.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (GS.mode === id ? ' active' : '');
    btn.textContent = label;
    btn.dataset.mode = id;
    btn.addEventListener('click', () => {
      if (GS.mode === id) return;
      if (id === 'usa') {
        // Enter USA overworld — don't reset USA_MAP results
        initUSAMode();
        initGame('usa');
        UI.selectedPollId = null;
        UI.pollPrediction  = null;
        document.getElementById('feedback-panel').innerHTML = '';
        document.getElementById('result-area').innerHTML    = '';
        renderAll();
        return;
      }
      addLog(`// switched to ${id} mode`, '');
      initGame(id);
      UI.selectedPollId = null;
      UI.pollPrediction  = null;
      document.getElementById('feedback-panel').innerHTML = '';
      resetLogEntry(id);
      renderAll();
    });
    el.appendChild(btn);
  });
}

function resetLogEntry(mode) {
  document.getElementById('action-log').innerHTML =
    `<div class="log-entry">// ${mode === 'campaign'
      ? 'campaign trail — 3 rounds, accuracy increases, budget resets'
      : 'classic mode — Bob leads, manipulate to help Alice win'}</div>`;
}

function renderRoundOrAccuracy() {
  const el = document.getElementById('round-accuracy');
  el.innerHTML = '';

  // USA map view: nothing to show here
  if (GS.mode === 'usa' && USA_MAP.view === 'map') return;

  if (GS.mode === 'campaign') {
    const cfg = CAMPAIGN_ROUNDS[GS.round - 1];
    const dots = CAMPAIGN_ROUNDS.map((r, i) => {
      const cls = i + 1 < GS.round ? 'round-dot done'
                : i + 1 === GS.round ? 'round-dot active'
                : 'round-dot';
      return `<span class="${cls}"></span>${i < CAMPAIGN_ROUNDS.length - 1 ? '<span class="round-line"></span>' : ''}`;
    }).join('');

    el.innerHTML = `
      <div class="round-progress">${dots}</div>
      <div class="round-info">
        <span class="round-name">Round ${GS.round} / ${CAMPAIGN_ROUNDS.length} — ${cfg.name}</span>
        <span class="round-stats">Accuracy: ${Math.round(cfg.accuracy * 100)}% · Budget: $${cfg.budget} · ${cfg.pollCount} polls</span>
      </div>`;
  } else {
    const acc = Math.round(GS.accuracy * 100);
    el.innerHTML = `
      <div class="acc-control">
        <label class="acc-label" for="acc-slider">Accuracy</label>
        <input type="range" id="acc-slider" min="${Math.round(CURATED_DEFAULTS.minAcc * 100)}"
               max="${Math.round(CURATED_DEFAULTS.maxAcc * 100)}" step="5" value="${acc}">
        <span class="acc-val" id="acc-val">${acc}%</span>
      </div>
      <div class="acc-hint" id="acc-hint">${accuracyHint(GS.accuracy)}</div>`;

    // Wire the slider
    const slider = document.getElementById('acc-slider');
    if (slider) {
      slider.addEventListener('input', e => {
        if (GS.over) return;
        const v = parseInt(e.target.value) / 100;
        document.getElementById('acc-val').textContent = e.target.value + '%';
        document.getElementById('acc-hint').textContent = accuracyHint(v);
        setCuratedAccuracy(v);
        UI.selectedPollId = null;
        renderAll();
      });
    }
  }
}

function accuracyHint(acc) {
  if (acc <= 0.4) return 'Very noisy — most polls are unreliable or fake.';
  if (acc <= 0.6) return 'Roughly half-reliable — significant chance of fake polls.';
  if (acc <= 0.75) return 'Moderately accurate — some polls may be fake.';
  if (acc <= 0.85) return 'Fairly reliable — small chance of fake polls.';
  return 'Highly accurate — most polls reflect real ballots.';
}

function renderMethodSelector() {
  const el   = document.getElementById('method-selector');
  const desc = document.getElementById('method-desc');
  const row  = document.querySelector('.method-desc-row');

  // USA mode always uses plurality — hide the selector
  if (GS.mode === 'usa') {
    el.innerHTML = '';
    if (desc) desc.textContent = '';
    if (row)  row.style.display = 'none';
    return;
  }
  if (row) row.style.display = '';

  el.innerHTML = '';
  METHODS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'mtab' + (GS.method === m ? ' active' : '');
    btn.textContent = m.charAt(0).toUpperCase() + m.slice(1);
    btn.title = METHOD_DESC[m];
    btn.addEventListener('click', () => {
      if (GS.over) return;
      GS.method = m;
      renderAll();
    });
    el.appendChild(btn);
  });

  if (desc) desc.textContent = METHOD_DESC[GS.method];
}

function renderHUDLeader() {
  const el = document.getElementById('hud-leader');
  if (!el) return;

  // USA map view: show national leader instead of poll leader
  if (GS.mode === 'usa' && USA_MAP.view === 'map') {
    const leader = nationalLeader(USA_MAP.results);
    el.innerHTML = '';
    if (!leader) return;
    const cand = CAND_BY_ID[leader];
    const dot  = document.createElement('span');
    dot.className = 'leader-dot';
    dot.style.background = cand ? cand.color : '#888';
    const text = document.createElement('span');
    text.innerHTML = `National leader: <strong style="color:${cand?.cssVar || '#aaa'}">${cand?.name || leader}</strong>`;
    el.appendChild(dot);
    el.appendChild(text);
    return;
  }

  const { scores, winner } = computeAllMethods(GS.polls.filter(p => !p.removed)
    .map(p => ({ ranking: p.displayedRanking, removed: false })))[GS.method];

  el.innerHTML = '';
  const cand = CAND_BY_ID[winner];
  const dot = document.createElement('span');
  dot.className = 'leader-dot';
  dot.style.background = cand ? cand.color : '#888';
  const text = document.createElement('span');
  text.innerHTML = `Poll leader: <strong style="color:${cand?.cssVar || '#aaa'}">${cand?.name || winner}</strong>`;
  el.appendChild(dot);
  el.appendChild(text);
}

// ── Poll grid (deck view) ─────────────────────────────────────────────────────

export function renderPollGrid(animate = true) {
  const grid = document.getElementById('poll-grid');
  grid.innerHTML = '';

  // Render candidate column headers
  const headersEl = document.getElementById('deck-headers');
  if (headersEl) {
    headersEl.innerHTML = '';
    CAND_HEADERS.forEach(({ id, label }) => {
      const c = CAND_BY_ID[id];
      const cell = document.createElement('div');
      cell.className = 'deck-header-cell';
      cell.style.color            = c.color;
      cell.style.borderColor      = c.color + '55';
      cell.style.backgroundColor  = c.color + '14';
      cell.textContent = label;
      headersEl.appendChild(cell);
    });
  }

  const activeCount = GS.polls.filter(p => !p.removed).length;
  const countEl = document.getElementById('poll-count-label');
  if (countEl) countEl.textContent = `(${activeCount} active)`;

  // Group polls by current displayed ranking
  const groups = new Map();
  GS.polls.forEach(poll => {
    const key = poll.displayedRanking.join('>');
    if (!groups.has(key)) {
      groups.set(key, { ranking: [...poll.displayedRanking], polls: [] });
    }
    groups.get(key).polls.push(poll);
  });

  // Render all 6 fixed slots; only add deal animation when game state changes
  RANKING_SLOTS.forEach((ranking, i) => {
    const key   = ranking.join('>');
    const group = groups.get(key);
    const deck  = buildDeck(ranking, group ? group.polls : []);
    if (animate) {
      deck.style.setProperty('--deal-delay', `${i * 65}ms`);
      deck.classList.add('deck-dealing');
    }
    grid.appendChild(deck);
  });

  // After election: auto-expand all non-empty decks to reveal cards
  if (GS.over) {
    requestAnimationFrame(() => {
      grid.querySelectorAll('.deck-scroll').forEach(el => {
        el.style.transition = 'none';
        el.style.height = el.scrollHeight + 'px';
      });
    });
  }
}

// ── Poll standings bar (real-time first-choice counts from active polls) ─────

function renderPollStandings() {
  const el = document.getElementById('poll-standings');
  if (!el) return;

  // Hide after election — feedback panel takes over
  if (GS.over) { el.innerHTML = ''; return; }

  const active = GS.polls.filter(p => !p.removed);
  const total  = active.length;
  if (total === 0) { el.innerHTML = ''; return; }

  // Count first-choice votes per candidate
  const counts = {};
  CANDIDATES.forEach(c => { counts[c.id] = 0; });
  active.forEach(p => { counts[p.displayedRanking[0]]++; });

  // Leader by first-choice poll plurality
  const leader = CANDIDATES.reduce((a, b) => counts[a.id] >= counts[b.id] ? a : b);

  // Stacked proportional bar
  const bar = document.createElement('div');
  bar.className = 'standings-bar';
  CANDIDATES.forEach(c => {
    if (counts[c.id] === 0) return;
    const seg = document.createElement('div');
    seg.className = 'standings-seg';
    seg.style.width      = (counts[c.id] / total * 100) + '%';
    seg.style.background = c.color;
    seg.title = `${c.name}: ${counts[c.id]} first-choice`;
    bar.appendChild(seg);
  });

  // Legend: dot · name · count · ★ for leader
  const legend = document.createElement('div');
  legend.className = 'standings-legend';
  CANDIDATES.forEach(c => {
    const item = document.createElement('span');
    item.className = 'standings-item';
    item.innerHTML =
      `<span class="standings-dot" style="background:${c.color}"></span>` +
      `<span style="color:${c.cssVar}">${c.name}</span>` +
      `<span class="standings-num">${counts[c.id]}</span>` +
      (c.id === leader.id ? `<span class="standings-star">★</span>` : '');
    legend.appendChild(item);
  });

  el.innerHTML = '';
  el.appendChild(bar);
  el.appendChild(legend);
}

function buildDeck(ranking, polls) {
  const isEmpty          = polls.length === 0;
  const firstCand        = CAND_BY_ID[ranking[0]];
  const manipulatedCount = polls.filter(p => p.wasManipulated).length;
  const activeCount      = polls.filter(p => !p.removed).length;

  const deck = document.createElement('div');
  deck.className = 'deck' + (isEmpty ? ' deck-empty' : '');

  // ── Preview card ──────────────────────────────────────────────────────────
  const preview = document.createElement('div');
  preview.className = 'deck-preview-card' + (isEmpty ? ' empty' : '');
  if (firstCand && !isEmpty) preview.style.setProperty('--deck-accent', firstCand.color);

  // Badge: count/edit info, or real/fake breakdown after election
  const badge = document.createElement('div');
  badge.className = 'deck-badge';
  if (!isEmpty) {
    if (GS.over) {
      const realCount = polls.filter(p => !p.removed && !p.isFake).length;
      const fakeCount = polls.filter(p => !p.removed &&  p.isFake).length;
      badge.innerHTML =
        (realCount > 0 ? `<span class="deck-real">${realCount} real</span>` : '') +
        (fakeCount > 0 ? `<span class="deck-fake">${fakeCount} fake</span>` : '');
    } else {
      badge.innerHTML =
        `<span class="deck-count">×${activeCount}</span>` +
        (manipulatedCount > 0
          ? `<span class="deck-edited">${manipulatedCount} edited</span>`
          : '');
    }
  }
  preview.appendChild(badge);

  // Ranking rows
  const rankingEl = document.createElement('div');
  rankingEl.className = 'deck-ranking';
  ranking.forEach((cid, i) => {
    const c   = CAND_BY_ID[cid];
    const row = document.createElement('div');
    row.className = 'deck-rank-row' + (i === 0 ? ' first' : '');
    const color = isEmpty ? 'var(--border)' : (c?.cssVar || '#aaa');
    row.innerHTML =
      `<span class="deck-rank-num">${i + 1}.</span>` +
      `<span style="color:${color}">${c?.name || cid}</span>`;
    rankingEl.appendChild(row);
  });
  preview.appendChild(rankingEl);

  // Hover hint (only on non-empty decks)
  if (!isEmpty) {
    const hint = document.createElement('div');
    hint.className = 'deck-hover-hint';
    hint.textContent = GS.over ? 'click to inspect' : 'hover to browse';
    preview.appendChild(hint);
  }

  deck.appendChild(preview);

  // ── Scroll container — omit for empty decks ───────────────────────────────
  if (!isEmpty) {
    const scrollEl = document.createElement('div');
    scrollEl.className = 'deck-scroll';
    scrollEl.style.height = '0';

    polls.forEach(poll => scrollEl.appendChild(buildPollCard(poll)));
    deck.appendChild(scrollEl);

    // Expand on hover with per-card slide-in animation
    deck.addEventListener('mouseenter', () => {
      scrollEl.querySelectorAll('.poll-card').forEach((card, i) => {
        card.style.setProperty('--card-delay', `${i * 38}ms`);
        card.classList.remove('card-deal-in');
        void card.offsetWidth; // restart animation
        card.classList.add('card-deal-in');
      });
      scrollEl.style.height = Math.min(scrollEl.scrollHeight, 380) + 'px';
    });

    // Collapse on leave unless a card in this deck is selected or game is over
    deck.addEventListener('mouseleave', () => {
      if (GS.over) return;
      const hasSelected = polls.some(p => p.id === UI.selectedPollId);
      if (!hasSelected) scrollEl.style.height = '0';
    });
  }

  return deck;
}

/** Render a ranking as colored initials: A › B › C */
function rankingDots(ranking, muted = false) {
  return ranking.map(cid => {
    const c = CAND_BY_ID[cid];
    const col = muted ? 'var(--muted)' : (c?.color || '#aaa');
    return `<span style="color:${col};font-weight:700">${c?.name[0] || '?'}</span>`;
  }).join('<span class="rsep">›</span>');
}

function buildPollCard(poll) {
  const isSelected = UI.selectedPollId === poll.id;
  const firstCand  = CAND_BY_ID[poll.displayedRanking[0]];

  const card = document.createElement('div');
  card.className = [
    'poll-card',
    isSelected    ? 'selected'     : '',
    poll.removed  ? 'removed-card' : '',
  ].filter(Boolean).join(' ');

  card.dataset.pollId = poll.id;

  // Edited cards adopt the color of their new first-choice candidate
  if (poll.wasManipulated && !poll.removed && !GS.over) {
    const col = firstCand?.color || '';
    if (col) {
      card.style.borderColor  = col;
      card.style.background   = col + '18';  // ~9% opacity tint
      card.style.borderWidth  = '2px';
    }
  }

  // Card number
  const num = document.createElement('div');
  num.className = 'card-num';
  num.textContent = poll.id.toUpperCase();
  if (poll.wasManipulated && !GS.over) {
    const editedBadge = document.createElement('span');
    editedBadge.className = 'edited-badge';
    editedBadge.textContent = '✎';
    num.appendChild(editedBadge);
    const lockBadge = document.createElement('span');
    lockBadge.className = 'lock-badge';
    lockBadge.textContent = '🔒';
    num.appendChild(lockBadge);
  }
  card.appendChild(num);

  if (poll.removed) {
    const rm = document.createElement('div');
    rm.className = 'card-removed-label';
    rm.textContent = 'REMOVED';
    card.appendChild(rm);
    return card;
  }

  // Ranking
  const ranking = document.createElement('div');
  ranking.className = 'card-ranking';
  poll.displayedRanking.forEach((cid, i) => {
    const c = CAND_BY_ID[cid];
    const row = document.createElement('div');
    row.className = 'card-rank-row' + (i === 0 ? ' first' : '');
    row.innerHTML = `<span class="rank-num">${i + 1}.</span>
      <span class="rank-cand" style="color:${c?.cssVar || '#aaa'}">${c?.name || cid}</span>`;
    ranking.appendChild(row);
  });
  card.appendChild(ranking);

  // Post-election reveal — show poll ranking vs true ballot
  if (GS.over) {
    const reveal = document.createElement('div');
    reveal.className = 'card-reveal';

    // Type tags
    const tags = document.createElement('div');
    tags.className = 'card-reveal-tags';
    if (poll.isFake) {
      tags.innerHTML = '<span class="rtag rtag-fake">FAKE</span>' +
        (poll.wasManipulated ? '<span class="rtag rtag-wasted">WASTED</span>' : '');
    } else {
      tags.innerHTML = '<span class="rtag rtag-real">REAL</span>' +
        (poll.wasManipulated ? '<span class="rtag rtag-changed">CHANGED</span>' : '');
    }
    reveal.appendChild(tags);

    // Poll row — what the player saw
    const pollRow = document.createElement('div');
    pollRow.className = 'card-reveal-row';
    pollRow.innerHTML = '<span class="rlabel">poll</span>' + rankingDots(poll.displayedRanking);
    reveal.appendChild(pollRow);

    // Ballot row — the underlying truth
    const ballotRow = document.createElement('div');
    ballotRow.className = 'card-reveal-row';
    if (poll.isFake) {
      ballotRow.innerHTML = '<span class="rlabel">ballot</span><span class="rnone">none — fake</span>';
    } else {
      const ballot = GS.ballots.find(b => b.id === poll.linkedBallotId);
      ballotRow.innerHTML = '<span class="rlabel">ballot</span>' +
        (ballot ? rankingDots(ballot.ranking) : '<span class="rnone">?</span>');
      // Show original ranking if this ballot was changed
      if (poll.wasManipulated && ballot) {
        const origRow = document.createElement('div');
        origRow.className = 'card-reveal-row muted';
        origRow.innerHTML = '<span class="rlabel">was</span>' + rankingDots(ballot.originalRanking, true);
        reveal.appendChild(ballotRow);
        reveal.appendChild(origRow);
        card.appendChild(reveal);
        return card;
      }
    }
    reveal.appendChild(ballotRow);
    card.appendChild(reveal);
  }

  // Click to select/deselect — no re-animation on mere selection change
  card.addEventListener('click', () => {
    if (GS.over) return;
    UI.selectedPollId = UI.selectedPollId === poll.id ? null : poll.id;
    renderPollGrid(false);
    renderActionPanel();
  });

  return card;
}

// ── Action panel ──────────────────────────────────────────────────────────────

export function renderActionPanel() {
  const panel = document.getElementById('sel-panel');
  const head  = document.getElementById('sel-head');
  const body  = document.getElementById('sel-body');

  if (GS.over) {
    panel.className  = 'sel-panel empty';
    head.className   = 'sel-head empty-h';
    head.textContent = 'Election complete';
    body.innerHTML   = '<div class="no-sel">See results below.</div>';
    return;
  }

  const pollCard = GS.polls.find(p => p.id === UI.selectedPollId);

  if (!pollCard) {
    panel.className  = 'sel-panel empty';
    head.className   = 'sel-head empty-h';
    head.textContent = 'No card selected';
    body.innerHTML   = '<div class="no-sel"><span class="arrow-hint">←</span>Click a poll card to select it, then choose an action.</div>';
    return;
  }

  if (pollCard.removed) {
    panel.className  = 'sel-panel empty';
    head.className   = 'sel-head empty-h';
    head.textContent = pollCard.id.toUpperCase() + ' — Removed';
    body.innerHTML   = '<div class="no-sel">This ballot has been removed from the electorate.</div>';
    return;
  }

  if (pollCard.wasManipulated) {
    panel.className  = 'sel-panel locked';
    head.className   = 'sel-head locked-h';
    head.textContent = pollCard.id.toUpperCase() + ' — Locked';
    body.innerHTML   = '<div class="no-sel">Already manipulated — each poll can only be used once.</div>';
    return;
  }

  panel.className  = 'sel-panel active';
  head.className   = 'sel-head active-h';
  head.textContent = pollCard.id.toUpperCase() + ' — Selected';

  // Preview the ranking
  const preview = pollCard.displayedRanking.map((cid, i) => {
    const c = CAND_BY_ID[cid];
    return `${i + 1}. <span style="color:${c?.cssVar || '#aaa'}">${c?.name || cid}</span>`;
  }).join('<br>');

  body.innerHTML = `
    <div class="sel-desc">Poll shows:</div>
    <div class="sel-ballot-preview">${preview}</div>
    <div class="sel-note">Actions applied to this poll — if it is real, the true ballot changes too.</div>
  `;

  // Removals remaining note
  if (GS.removalsUsed > 0) {
    const note = document.createElement('div');
    note.className = 'removal-note';
    note.textContent = `Ballot removals: ${GS.removalsUsed}/2 used this round`;
    body.appendChild(note);
  }

  const aliceLeads = pollCard.displayedRanking[0] === 'alice';
  if (aliceLeads) {
    const msg = document.createElement('div');
    msg.className = 'no-actions-msg';
    msg.textContent = 'Alice already leads here — no actions needed.';
    body.appendChild(msg);
    return;
  }

  // Action buttons
  const list = document.createElement('div');
  list.className = 'action-list';
  for (const action of PLAYER_ACTIONS) {
    if (!['move-alice-up','move-alice-first','drop-rival','remove-ballot'].includes(action.id)) continue;
    const btn = document.createElement('button');
    btn.className = 'act-btn';
    btn.disabled  = !action.available(pollCard, GS) || GS.budget < action.cost;

    btn.innerHTML = `
      <div class="act-name">${action.emoji} ${action.name}</div>
      <div class="act-desc">${action.desc}</div>
      <div class="act-cost">$${action.cost}</div>
    `;

    btn.addEventListener('click', () => {
      const msg = executeAction(action.id, pollCard.id);
      if (msg) {
        addLog(msg, 'action');
        UI.selectedPollId = null;
        renderAll();
      }
    });
    list.appendChild(btn);
  }
  body.appendChild(list);
}

// ── Budget ────────────────────────────────────────────────────────────────────

export function renderBudget() {
  const b    = GS.budget;
  const maxB = GS.mode === 'campaign'
    ? CAMPAIGN_ROUNDS[GS.round - 1].budget
    : CURATED_DEFAULTS.budget;
  const pct  = Math.round(b / maxB * 100);
  const col  = b < maxB * 0.2 ? 'var(--danger)'
             : b < maxB * 0.45 ? 'var(--warning)'
             : 'var(--success)';

  document.getElementById('budget-big').textContent   = '$' + b;
  document.getElementById('budget-big').style.color   = col;
  document.getElementById('budget-fill').style.width  = pct + '%';
  document.getElementById('budget-fill').style.background = col;

  const spent = maxB - b;
  document.getElementById('budget-sub').textContent =
    GS.mode === 'campaign'
      ? `Round ${GS.round} · $${spent} spent · $${b} left`
      : `$${GS.spent} spent · $${b} remaining`;
}

// ── Run / Advance button ──────────────────────────────────────────────────────

function renderRunButton() {
  // Update reset button label contextually
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    if (GS.mode === 'usa' && USA_MAP.view === 'district') {
      resetBtn.textContent = '← abandon district';
    } else if (GS.mode === 'usa' && USA_MAP.view === 'map') {
      resetBtn.textContent = '↺  reset USA map';
    } else {
      resetBtn.textContent = '↺  reset game';
    }
  }

  const btn = document.getElementById('run-btn');

  if (GS.mode === 'usa' && USA_MAP.view === 'map') {
    btn.textContent = '← Back (already on map)';
    btn.disabled    = true;
    return;
  }

  if (GS.over) {
    if (GS.mode === 'usa') {
      btn.disabled    = false;
      btn.textContent = '◀  Return to Map';
      btn.className   = 'run-btn run-btn-return';
    } else {
      btn.textContent = '✓ Election Complete';
      btn.disabled    = true;
      btn.className   = 'run-btn';
    }
    return;
  }

  btn.disabled  = false;
  btn.className = 'run-btn';

  const isCampaignLike = GS.mode === 'campaign' || GS.mode === 'usa';
  if (isCampaignLike && GS.round < CAMPAIGN_ROUNDS.length) {
    const next = CAMPAIGN_ROUNDS[GS.round];
    btn.textContent = `▶  Advance to Round ${GS.round + 1} — ${next.name}`;
  } else {
    btn.textContent = '▶  RUN THE TRUE ELECTION';
  }
}

// ── Log ───────────────────────────────────────────────────────────────────────

export function addLog(msg, type = '') {
  const log   = document.getElementById('action-log');
  const entry = document.createElement('div');
  entry.className  = 'log-entry' + (type ? ' ' + type : '');
  entry.textContent = '> ' + msg;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ── Run election / advance round ──────────────────────────────────────────────

export function handleRunButton() {
  // Post-election in USA district mode: return to map
  if (GS.over && GS.mode === 'usa') {
    returnToMap();
    document.getElementById('feedback-panel').innerHTML = '';
    document.getElementById('result-area').innerHTML    = '';
    document.getElementById('action-log').innerHTML     =
      '<div class="log-entry">// district complete — select a state to continue</div>';
    UI.selectedPollId = null;
    UI.pollPrediction = null;
    renderAll();
    return;
  }

  if (GS.over) return;

  const isCampaignLike = GS.mode === 'campaign' || GS.mode === 'usa';
  if (isCampaignLike && GS.round < CAMPAIGN_ROUNDS.length) {
    addLog(`Round ${GS.round} complete. Advancing to Round ${GS.round + 1}.`, 'info');
    advanceRound();
    UI.selectedPollId = null;
    renderAll();
    return;
  }

  // Snapshot poll prediction before revealing true ballots
  const predPseudo = GS.polls
    .filter(p => !p.removed)
    .map(p => ({ ranking: [...p.displayedRanking], removed: false }));
  UI.pollPrediction = computeAllMethods(predPseudo);

  // Run the election
  const { trueResults, baselineResults } = runElection();
  const winner = trueResults[GS.method].winner;
  const youWin = winner === 'alice';

  addLog(`TRUE election [${GS.method}]: ${CAND_BY_ID[winner]?.name || winner} wins.`, youWin ? 'good' : 'bad');

  // Save district result before anything else in USA mode
  if (GS.mode === 'usa') {
    recordDistrictResult(winner);
  }

  // Show result banner
  const area = document.getElementById('result-area');
  const banner = document.createElement('div');
  banner.className = 'result-banner ' + (youWin ? 'win' : 'lose');
  const winnerName = CAND_BY_ID[winner]?.name || winner;

  if (GS.mode === 'usa') {
    const stateName = STATE_BY_ID[USA_MAP.activeStateId]?.name || USA_MAP.activeStateId;
    const di = USA_MAP.districtIndex + 1;
    banner.innerHTML = youWin
      ? `✓ ALICE WINS — ${stateName} District ${di}<div class="result-sub">click ◀ Return to Map to continue</div>`
      : `✗ ${winnerName.toUpperCase()} WINS — ${stateName} District ${di}<div class="result-sub">click ◀ Return to Map to continue</div>`;
  } else {
    banner.innerHTML = youWin
      ? `✓ ALICE WINS — manipulation succeeded<div class="result-sub">$${GS.spent} spent across all rounds</div>`
      : `✗ ${winnerName.toUpperCase()} WINS — Alice lost<div class="result-sub">$${GS.spent} spent · try different tactics</div>`;
  }
  area.innerHTML = '';
  area.appendChild(banner);

  UI.selectedPollId = null;
  renderAll();

  // Render the endgame feedback panel
  renderFeedback(GS, trueResults, baselineResults);
}

// ── Live results preview ──────────────────────────────────────────────────────
//
// Always visible. During game: computed from poll display rankings (prediction).
// After election:  computed from true manipulated ballots (ground truth).

function renderResultsPreview() {
  const el = document.getElementById('results-preview');
  if (!el) return;
  el.innerHTML = '';

  let pluralityResult, bordaResult, irvResult, rankBallots, isLive;

  if (GS.over && GS.trueResults) {
    pluralityResult = GS.trueResults.plurality;
    bordaResult     = GS.trueResults.borda;
    irvResult       = GS.trueResults.irv;
    rankBallots     = GS.ballots.filter(b => !b.removed);
    isLive          = false;
  } else {
    const pseudo    = GS.polls
      .filter(p => !p.removed)
      .map(p => ({ ranking: [...p.displayedRanking], removed: false }));
    const res       = computeAllMethods(pseudo);
    pluralityResult = res.plurality;
    bordaResult     = res.borda;
    irvResult       = res.irv;
    rankBallots     = pseudo;
    isLive          = true;
  }

  const pred = UI.pollPrediction;  // null during game, set after election

  el.appendChild(buildPluralityPanel(rankBallots, pluralityResult, isLive, pred?.plurality));
  el.appendChild(buildBordaPanel(rankBallots, bordaResult, isLive, pred?.borda));
  el.appendChild(buildIRVPanel(irvResult, isLive, pred?.irv));
}

function buildPluralityPanel(ballots, result, isLive, predResult) {
  const panel = document.createElement('div');
  panel.className = 'preview-panel' + (isLive ? ' live' : ' final');

  const hdr = document.createElement('div');
  hdr.className = 'preview-panel-hdr';
  hdr.innerHTML =
    `<span class="preview-panel-title">Plurality</span>` +
    `<span class="preview-tag ${isLive ? 'tag-live' : 'tag-final'}">${isLive ? 'poll estimate' : 'true result'}</span>`;
  panel.appendChild(hdr);

  const sub = document.createElement('div');
  sub.className = 'preview-sub';
  sub.textContent = 'Candidate with the most first-choice votes wins.';
  panel.appendChild(sub);

  const total = ballots.length || 1;
  const counts = {};
  CANDIDATES.forEach(c => { counts[c.id] = 0; });
  for (const b of ballots) {
    if (b.ranking && b.ranking[0]) counts[b.ranking[0]] = (counts[b.ranking[0]] || 0) + 1;
  }

  const sorted = [...CANDIDATES].sort(
    (a, b) => (result.scores[b.id] || 0) - (result.scores[a.id] || 0)
  );

  sorted.forEach((cand, si) => {
    const count    = counts[cand.id] || 0;
    const pct      = (count / total * 100).toFixed(1);
    const isWinner = cand.id === result.winner;
    const predCount = (!isLive && predResult) ? (predResult.scores[cand.id] ?? '?') : null;

    const row = document.createElement('div');
    row.className = 'plurality-cand-row' + (isWinner ? ' plurality-winner' : '');
    row.style.setProperty('--plur-delay', `${si * 100}ms`);
    row.style.setProperty('--plur-bar-w', pct + '%');
    row.style.setProperty('--plur-color', cand.color);

    const rowHdr = document.createElement('div');
    rowHdr.className = 'plurality-cand-header';
    const predTag = predCount !== null
      ? `<span class="pred-was">est: ${predCount}</span>`
      : '';
    rowHdr.innerHTML =
      `<span class="plurality-cand-name" style="color:${cand.cssVar}">${cand.name}${isWinner ? ' ★' : ''}</span>` +
      `<span class="plurality-score" style="color:${cand.cssVar}">${count}<span class="plurality-pct"> (${pct}%)</span></span>${predTag}`;
    row.appendChild(rowHdr);

    const track = document.createElement('div');
    track.className = 'plurality-bar-track';
    const fill = document.createElement('div');
    fill.className = 'plurality-bar-fill';
    fill.style.background = cand.color;
    track.appendChild(fill);
    row.appendChild(track);

    panel.appendChild(row);
  });

  if (!isLive && predResult) {
    panel.appendChild(buildPredCompare(predResult, result));
  }

  return panel;
}

/** Builds the prediction-vs-truth row shown at the bottom of post-election panels. */
function buildPredCompare(predResult, trueResult) {
  const predC = CAND_BY_ID[predResult.winner];
  const trueC = CAND_BY_ID[trueResult.winner];
  const match = predResult.winner === trueResult.winner;
  const el = document.createElement('div');
  el.className = 'pred-compare';
  el.innerHTML =
    `<span class="pred-label">Polls predicted:</span> ` +
    `<span style="color:${predC?.cssVar || '#aaa'}">${predC?.name || predResult.winner}</span>` +
    `<span class="pred-sep">·</span>` +
    `<span class="pred-label">True:</span> ` +
    `<span style="color:${trueC?.cssVar || '#aaa'}">${trueC?.name || trueResult.winner}</span>` +
    `<span class="${match ? 'pred-correct' : 'pred-wrong'}">${match ? '✓ match' : '✗ off'}</span>`;
  return el;
}

function buildBordaPanel(ballots, result, isLive, predResult) {
  const panel = document.createElement('div');
  panel.className = 'preview-panel' + (isLive ? ' live' : ' final');

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'preview-panel-hdr';
  hdr.innerHTML =
    `<span class="preview-panel-title">Borda Count</span>` +
    `<span class="preview-tag ${isLive ? 'tag-live' : 'tag-final'}">${isLive ? 'poll estimate' : 'true result'}</span>`;
  panel.appendChild(hdr);

  const sub = document.createElement('div');
  sub.className = 'preview-sub';
  sub.innerHTML = '1st = <strong>2 pts</strong> · 2nd = <strong>1 pt</strong> · 3rd = 0 pts — highest total wins';
  panel.appendChild(sub);

  // Compute rank distributions
  const maxPts = ballots.length * 2 || 1;
  const rc = {};
  CANDIDATES.forEach(c => { rc[c.id] = { r1: 0, r2: 0, r3: 0 }; });
  for (const b of ballots) {
    b.ranking.forEach((cid, i) => {
      if (i === 0) rc[cid].r1++;
      else if (i === 1) rc[cid].r2++;
      else rc[cid].r3++;
    });
  }

  const sorted = [...CANDIDATES].sort(
    (a, b) => (result.scores[b.id] || 0) - (result.scores[a.id] || 0)
  );

  // Pre-compute poll-estimated rank distributions for comparison
  const predRc = {};
  if (!isLive && predResult) {
    CANDIDATES.forEach(c => { predRc[c.id] = { r1: 0, r2: 0, r3: 0 }; });
    // Re-derive from poll pseudo-ballots: not stored, but predResult.scores gives totals.
    // We can't reconstruct r1/r2/r3 from scores alone, so just use predResult.scores for the header.
  }

  sorted.forEach((cand, si) => {
    const score     = result.scores[cand.id] || 0;
    const predScore = (!isLive && predResult) ? (predResult.scores[cand.id] ?? '?') : null;
    const r         = rc[cand.id];
    const r1w       = ((r.r1 * 2) / maxPts * 100).toFixed(1);
    const r2w       = (r.r2 / maxPts * 100).toFixed(1);
    const isWinner  = cand.id === result.winner;

    const row = document.createElement('div');
    row.className = 'borda-cand-row' + (isWinner ? ' borda-winner' : '');
    row.style.setProperty('--borda-delay', `${si * 120}ms`);
    row.style.setProperty('--borda-r1-w', r1w + '%');
    row.style.setProperty('--borda-r2-w', r2w + '%');

    const rowHdr = document.createElement('div');
    rowHdr.className = 'borda-cand-header';
    const predTag = predScore !== null
      ? `<span class="pred-was">est: ${predScore} pts</span>`
      : '';
    rowHdr.innerHTML =
      `<span class="borda-cand-name" style="color:${cand.cssVar}">${cand.name}${isWinner ? ' ★' : ''}</span>` +
      `<span style="display:flex;align-items:baseline;gap:0">` +
      `<span class="borda-score" style="color:${cand.cssVar}">${score} pts</span>${predTag}</span>`;
    row.appendChild(rowHdr);

    const track = document.createElement('div');
    track.className = 'borda-bar-track';
    const s1 = document.createElement('div');
    s1.className = 'borda-bar-rank1';
    s1.style.background = cand.color;
    const s2 = document.createElement('div');
    s2.className = 'borda-bar-rank2';
    s2.style.background = cand.color + '70';
    track.appendChild(s1);
    track.appendChild(s2);
    row.appendChild(track);

    const bd = document.createElement('div');
    bd.className = 'borda-breakdown';
    bd.innerHTML =
      `<span style="color:${cand.color}">${r.r1}×2</span> + ` +
      `<span style="color:${cand.color}99">${r.r2}×1</span> + ` +
      `<span class="borda-zero">${r.r3}×0</span> = ${score} pts`;
    row.appendChild(bd);

    panel.appendChild(row);
  });

  if (!isLive && predResult) {
    panel.appendChild(buildPredCompare(predResult, result));
  }

  return panel;
}

function buildIRVPanel(irvResult, isLive, predResult) {
  const panel = document.createElement('div');
  panel.className = 'preview-panel' + (isLive ? ' live' : ' final');

  const hdr = document.createElement('div');
  hdr.className = 'preview-panel-hdr';
  hdr.innerHTML =
    `<span class="preview-panel-title">IRV — Instant Runoff</span>` +
    `<span class="preview-tag ${isLive ? 'tag-live' : 'tag-final'}">${isLive ? 'poll estimate' : 'true result'}</span>`;
  panel.appendChild(hdr);

  const sub = document.createElement('div');
  sub.className = 'preview-sub';
  sub.textContent = 'Lowest candidate eliminated each round. Their votes transfer to next choice.';
  panel.appendChild(sub);

  const allCounts = irvResult.steps.flatMap(s => Object.values(s.counts));
  const maxVotes  = Math.max(...allCounts, 1);

  const roundsEl = document.createElement('div');
  roundsEl.className = 'irv-rounds-viz';

  irvResult.steps.forEach((step, si) => {
    const roundDelay = si * 500;
    const totalVotes = Object.values(step.counts).reduce((a, b) => a + b, 0);
    const majority   = Math.floor(totalVotes / 2) + 1;
    // Find the matching predicted step by round number (may not exist if poll had fewer rounds)
    const predStep = (!isLive && predResult)
      ? (predResult.steps ?? []).find(s => s.round === step.round)
      : null;

    const col = document.createElement('div');
    col.className = 'irv-round-viz-col';

    const heading = document.createElement('div');
    heading.className = 'irv-round-viz-heading';
    heading.textContent = `Round ${step.round}`;
    col.appendChild(heading);

    const barsEl = document.createElement('div');
    barsEl.className = 'irv-round-bars';

    CANDIDATES.forEach((cand, ci) => {
      const isAlive    = step.alive.includes(cand.id);
      const isElim     = step.eliminated === cand.id;
      const isWinner   = step.winner === cand.id;
      const alreadyOut = !isAlive && !isElim;
      const count      = step.counts[cand.id] ?? 0;
      const barPct     = alreadyOut ? '0' : (count / maxVotes * 100).toFixed(1);
      const predCount  = predStep ? (predStep.counts[cand.id] ?? null) : null;

      const candRow = document.createElement('div');
      candRow.className = [
        'irv-cand-bar-row',
        isElim     ? 'irv-being-eliminated' : '',
        isWinner   ? 'irv-round-winner'     : '',
        alreadyOut ? 'irv-already-out'      : '',
      ].filter(Boolean).join(' ');
      candRow.style.setProperty('--irv-color', cand.color);
      candRow.style.setProperty('--irv-bar-w', barPct + '%');
      candRow.style.setProperty('--irv-delay', `${roundDelay + ci * 90}ms`);

      const nameEl = document.createElement('div');
      nameEl.className = 'irv-cand-name';
      nameEl.style.color = alreadyOut ? 'var(--border)' : cand.color;
      nameEl.textContent = cand.name;
      candRow.appendChild(nameEl);

      const trackEl = document.createElement('div');
      trackEl.className = 'irv-bar-track';
      const fillEl = document.createElement('div');
      fillEl.className = 'irv-bar-fill';
      trackEl.appendChild(fillEl);
      candRow.appendChild(trackEl);

      const countEl = document.createElement('div');
      countEl.className = 'irv-bar-count';
      countEl.style.color = alreadyOut ? 'var(--border)' : 'var(--text)';
      if (alreadyOut) {
        countEl.textContent = '—';
      } else if (predCount !== null) {
        countEl.innerHTML = `${count}<span class="pred-was">${predCount}</span>`;
      } else {
        countEl.textContent = String(count);
      }
      candRow.appendChild(countEl);

      if (isElim) {
        const b = document.createElement('span');
        b.className = 'irv-status-badge irv-elim-badge';
        b.textContent = '✕ out';
        candRow.appendChild(b);
      } else if (isWinner) {
        const b = document.createElement('span');
        b.className = 'irv-status-badge irv-winner-badge';
        b.textContent = '★ wins';
        candRow.appendChild(b);
      }

      barsEl.appendChild(candRow);
    });

    col.appendChild(barsEl);

    const thresh = document.createElement('div');
    thresh.className = 'irv-threshold-note';
    thresh.textContent = `majority: ${majority} votes`;
    col.appendChild(thresh);

    if (step.eliminated) {
      const c = CAND_BY_ID[step.eliminated];
      const redist = document.createElement('div');
      redist.className = 'irv-redist-note';
      redist.innerHTML = `↳ <strong>${c?.name}'s</strong> votes transfer →`;
      col.appendChild(redist);
    }

    roundsEl.appendChild(col);

    if (si < irvResult.steps.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'irv-round-arrow';
      arrow.textContent = '→';
      roundsEl.appendChild(arrow);
    }
  });

  panel.appendChild(roundsEl);

  if (!isLive && predResult) {
    panel.appendChild(buildPredCompare(predResult, irvResult));
  }

  return panel;
}

// ── USA Map rendering ─────────────────────────────────────────────────────────

function renderUSAMap() {
  renderUSAScoreboard();
  renderUSAGrid();
  renderUSAStatus();
  renderUSABreadcrumb();
}

function renderUSAScoreboard() {
  const el = document.getElementById('usa-scoreboard');
  if (!el) return;
  el.innerHTML = '';

  const scores  = nationalScores(USA_MAP.results);
  const leader  = nationalLeader(USA_MAP.results);
  const total   = STATES.length;
  const played  = total - scores.unplayed;

  CANDIDATES.forEach(c => {
    const count = scores[c.id] || 0;
    const pct   = total > 0 ? (count / total * 100).toFixed(0) : 0;
    const isLeading = c.id === leader;

    const item = document.createElement('div');
    item.className = 'usa-score-item';

    const dot = document.createElement('span');
    dot.className   = 'usa-score-dot';
    dot.style.background = c.color;

    const nameEl = document.createElement('span');
    nameEl.className = 'usa-score-name';
    nameEl.style.color = c.cssVar;
    nameEl.textContent = c.name;

    const countEl = document.createElement('span');
    countEl.className = 'usa-score-count';
    countEl.style.color = c.cssVar;
    countEl.textContent = String(count);

    const labelEl = document.createElement('span');
    labelEl.className = 'usa-score-label';
    labelEl.textContent = 'states';

    const track = document.createElement('div');
    track.className = 'usa-score-bar-track';
    const fill = document.createElement('div');
    fill.className   = 'usa-score-bar-fill';
    fill.style.background = c.color;
    fill.style.width      = pct + '%';
    track.appendChild(fill);

    item.appendChild(dot);
    item.appendChild(nameEl);
    item.appendChild(countEl);
    item.appendChild(labelEl);
    item.appendChild(track);

    if (isLeading && count > 0) {
      const tag = document.createElement('span');
      tag.className   = 'usa-leader-tag';
      tag.textContent = 'leading';
      item.appendChild(tag);
    }

    el.appendChild(item);
  });

  // Progress indicator
  if (played > 0) {
    const prog = document.createElement('div');
    prog.style.cssText = 'font-size:9px;font-family:"DM Mono",monospace;color:var(--muted);margin-left:auto;white-space:nowrap;';
    prog.textContent   = `${played}/${total} states played`;
    el.appendChild(prog);
  }
}

function renderUSAGrid() {
  const grid = document.getElementById('usa-grid');
  if (!grid) return;
  grid.innerHTML = '';

  STATES.forEach(state => {
    const results    = USA_MAP.results[state.id] ?? [];
    const played     = results.filter(w => w != null).length;
    const allPlayed  = played === state.districts;
    const winner     = stateWinner(results);
    const isActive   = USA_MAP.activeStateId === state.id && USA_MAP.view === 'district';

    const tile = document.createElement('div');
    tile.className = [
      'state-tile',
      winner    ? winner + '-lead' : '',
      allPlayed ? 'all-played'     : '',
      played > 0 && !allPlayed ? 'partial' : '',
      isActive  ? 'active-district' : '',
    ].filter(Boolean).join(' ');

    tile.style.gridRow    = state.row;
    tile.style.gridColumn = state.col;
    tile.title = `${state.name} (${played}/${state.districts} districts played)`;

    const abbr = document.createElement('div');
    abbr.className   = 'state-tile-abbr';
    abbr.textContent = state.id;
    tile.appendChild(abbr);

    // District progress dots (only if multi-district)
    if (state.districts > 1) {
      const dots = document.createElement('div');
      dots.className = 'state-tile-dots';
      for (let i = 0; i < state.districts; i++) {
        const dot = document.createElement('div');
        const w   = results[i];
        dot.className = 'state-dot' + (w ? ' ' + w : ' empty');
        dots.appendChild(dot);
      }
      tile.appendChild(dots);
    }

    // Click: start next unplayed district
    if (!allPlayed) {
      tile.addEventListener('click', () => {
        if (!startDistrict(state.id, state.districts)) return;
        initGame('usa');
        UI.selectedPollId = null;
        UI.pollPrediction = null;
        document.getElementById('feedback-panel').innerHTML = '';
        document.getElementById('result-area').innerHTML    = '';
        document.getElementById('action-log').innerHTML =
          `<div class="log-entry">// ${state.name} — District ${USA_MAP.districtIndex + 1} · manipulate polls to win · not all polls are real</div>`;
        renderAll();
      });
    }

    grid.appendChild(tile);
  });
}

function renderUSAStatus() {
  const el = document.getElementById('usa-status');
  if (!el) return;
  const leader = nationalLeader(USA_MAP.results);
  const scores = nationalScores(USA_MAP.results);
  if (!leader) {
    el.textContent = 'Click any state to begin playing its district(s). Win districts to capture states.';
  } else {
    const c = CAND_BY_ID[leader];
    el.innerHTML =
      `<span style="color:${c?.cssVar}">${c?.name}</span> leads with ${scores[leader]} state${scores[leader] !== 1 ? 's' : ''} · ` +
      `${scores.unplayed} state${scores.unplayed !== 1 ? 's' : ''} remaining`;
  }
}

function renderUSABreadcrumb() {
  // Show a district breadcrumb above the game when playing a district in USA mode
  const existing = document.getElementById('district-breadcrumb');
  if (existing) existing.remove();

  if (GS.mode !== 'usa' || USA_MAP.view !== 'district') return;

  const state = STATE_BY_ID[USA_MAP.activeStateId];
  if (!state) return;

  const bc = document.createElement('div');
  bc.id        = 'district-breadcrumb';
  bc.className = 'district-breadcrumb';
  bc.innerHTML =
    `<span>USA Map</span><span class="bc-sep">›</span>` +
    `<strong>${state.name}</strong><span class="bc-sep">›</span>` +
    `District ${USA_MAP.districtIndex + 1} of ${state.districts}` +
    `<span style="margin-left:auto;opacity:0.5">Plurality · 3 rounds</span>`;

  const mainLayout = document.querySelector('.main-layout');
  mainLayout?.parentNode.insertBefore(bc, mainLayout);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function handleReset() {
  // In USA district view: abandon district and return to map
  if (GS.mode === 'usa' && USA_MAP.view === 'district') {
    returnToMap();
    document.getElementById('feedback-panel').innerHTML = '';
    document.getElementById('result-area').innerHTML    = '';
    document.getElementById('action-log').innerHTML     =
      '<div class="log-entry">// returned to map — district abandoned</div>';
    UI.selectedPollId = null;
    UI.pollPrediction = null;
    renderAll();
    return;
  }

  // In USA map view: reset the entire USA campaign
  if (GS.mode === 'usa' && USA_MAP.view === 'map') {
    initUSAMode();
    document.getElementById('result-area').innerHTML = '';
    renderAll();
    return;
  }

  // Normal modes
  const mode = GS.mode;
  initGame(mode);
  UI.selectedPollId = null;
  UI.pollPrediction = null;

  document.getElementById('result-area').innerHTML    = '';
  document.getElementById('feedback-panel').innerHTML = '';
  document.getElementById('action-log').innerHTML =
    '<div class="log-entry">// game reset — Bob leads, manipulate to help Alice win</div>';

  renderAll();
}
