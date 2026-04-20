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

// ── UI-only state ─────────────────────────────────────────────────────────────

export const UI = {
  selectedPollId: null,
};

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderAll() {
  renderControls();
  renderPollGrid();
  renderPollStandings();
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
}

function renderModeSelector() {
  const el = document.getElementById('mode-selector');
  el.innerHTML = '';
  ['curated', 'campaign'].forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (GS.mode === m ? ' active' : '');
    btn.textContent = m === 'curated' ? 'Classic' : 'Campaign Trail';
    btn.dataset.mode = m;
    btn.addEventListener('click', () => {
      if (GS.mode === m) return;
      addLog(`// switched to ${m} mode`, '');
      initGame(m);
      UI.selectedPollId = null;
      document.getElementById('feedback-panel').innerHTML = '';
      resetLogEntry(m);
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
  const el = document.getElementById('method-selector');
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

  const desc = document.getElementById('method-desc');
  if (desc) desc.textContent = METHOD_DESC[GS.method];
}

function renderHUDLeader() {
  const el = document.getElementById('hud-leader');
  if (!el) return;
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

export function renderPollGrid() {
  const grid = document.getElementById('poll-grid');
  grid.innerHTML = '';

  const activeCount = GS.polls.filter(p => !p.removed).length;
  const countEl = document.getElementById('poll-count-label');
  if (countEl) countEl.textContent = `(${activeCount} active poll cards)`;

  // Group polls by their displayed ranking
  const groups = new Map();
  GS.polls.forEach(poll => {
    const key = poll.displayedRanking.join('>');
    if (!groups.has(key)) {
      groups.set(key, { ranking: [...poll.displayedRanking], polls: [] });
    }
    groups.get(key).polls.push(poll);
  });

  // Render decks sorted by active size (largest first)
  [...groups.values()]
    .sort((a, b) => {
      const aActive = a.polls.filter(p => !p.removed).length;
      const bActive = b.polls.filter(p => !p.removed).length;
      return bActive - aActive;
    })
    .forEach(({ ranking, polls }) => {
      grid.appendChild(buildDeck(ranking, polls));
    });

  // After election: auto-expand all decks to reveal cards
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
  const firstCand          = CAND_BY_ID[ranking[0]];
  const manipulatedCount   = polls.filter(p => p.wasManipulated).length;

  const deck = document.createElement('div');
  deck.className = 'deck';

  // ── Preview card (the visible "top of the deck") ──────────────────────────
  const preview = document.createElement('div');
  preview.className = 'deck-preview-card';
  // Per-deck accent colour for hover border, uses CSS custom property
  if (firstCand) preview.style.setProperty('--deck-accent', firstCand.color);

  // Count + edit badge (switches to real/fake reveal after election)
  const badge = document.createElement('div');
  badge.className = 'deck-badge';
  const activeCount = polls.filter(p => !p.removed).length;
  if (GS.over) {
    const realCount = polls.filter(p => !p.removed && !p.isFake).length;
    const fakeCount = polls.filter(p => !p.removed && p.isFake).length;
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
  preview.appendChild(badge);

  // Ranking rows (1. Bob  2. Carol  3. Alice)
  const rankingEl = document.createElement('div');
  rankingEl.className = 'deck-ranking';
  ranking.forEach((cid, i) => {
    const c   = CAND_BY_ID[cid];
    const row = document.createElement('div');
    row.className = 'deck-rank-row' + (i === 0 ? ' first' : '');
    row.innerHTML =
      `<span class="deck-rank-num">${i + 1}.</span>` +
      `<span style="color:${c?.cssVar || '#aaa'}">${c?.name || cid}</span>`;
    rankingEl.appendChild(row);
  });
  preview.appendChild(rankingEl);

  // Hover hint
  const hint = document.createElement('div');
  hint.className = 'deck-hover-hint';
  hint.textContent = GS.over ? 'hover to reveal' : 'hover to browse';
  preview.appendChild(hint);

  deck.appendChild(preview);

  // ── Scroll container (collapses to 0, expands on hover) ──────────────────
  const scrollEl = document.createElement('div');
  scrollEl.className = 'deck-scroll';
  scrollEl.style.height = '0';

  polls.forEach(poll => scrollEl.appendChild(buildPollCard(poll)));
  deck.appendChild(scrollEl);

  // Expand on hover; keep open while a card from this deck is selected.
  // After election, decks stay open and don't collapse.
  deck.addEventListener('mouseenter', () => {
    scrollEl.style.height = Math.min(scrollEl.scrollHeight, 380) + 'px';
  });
  deck.addEventListener('mouseleave', () => {
    if (GS.over) return;
    const hasSelected = polls.some(p => p.id === UI.selectedPollId);
    if (!hasSelected) scrollEl.style.height = '0';
  });

  return deck;
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

  // Post-election reveal overlay
  if (GS.over) {
    const badge = document.createElement('div');
    if (poll.isFake) {
      badge.className = 'reveal-badge fake';
      badge.textContent = 'FAKE';
    } else {
      badge.className = 'reveal-badge real';
      badge.textContent = 'REAL';
    }
    card.appendChild(badge);

    if (poll.wasManipulated) {
      const eff = document.createElement('div');
      if (poll.isFake) {
        eff.className = 'reveal-badge wasted';
        eff.textContent = '↳ WASTED';
      } else {
        eff.className = 'reveal-badge effective';
        eff.textContent = '↳ EFFECTIVE';
      }
      card.appendChild(eff);
    }
  }

  // Click to select/deselect
  card.addEventListener('click', () => {
    if (GS.over) return;
    UI.selectedPollId = UI.selectedPollId === poll.id ? null : poll.id;
    renderPollGrid();
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
  const btn = document.getElementById('run-btn');
  if (GS.over) {
    btn.textContent = '✓ Election Complete';
    btn.disabled    = true;
    return;
  }
  btn.disabled = false;
  if (GS.mode === 'campaign' && GS.round < CAMPAIGN_ROUNDS.length) {
    const next = CAMPAIGN_ROUNDS[GS.round]; // 0-indexed: current round is index GS.round-1
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
  if (GS.over) return;

  if (GS.mode === 'campaign' && GS.round < CAMPAIGN_ROUNDS.length) {
    addLog(`Round ${GS.round} complete. Advancing to Round ${GS.round + 1}.`, 'info');
    advanceRound();
    UI.selectedPollId = null;
    renderAll();
    return;
  }

  // Run the election
  const { trueResults, baselineResults } = runElection();
  const winner = trueResults[GS.method].winner;
  const youWin = winner === 'alice';

  addLog(`TRUE election [${GS.method}]: ${CAND_BY_ID[winner]?.name || winner} wins.`, youWin ? 'good' : 'bad');

  // Show result banner
  const area = document.getElementById('result-area');
  const banner = document.createElement('div');
  banner.className = 'result-banner ' + (youWin ? 'win' : 'lose');
  const winnerName = CAND_BY_ID[winner]?.name || winner;
  banner.innerHTML = youWin
    ? `✓ ALICE WINS — manipulation succeeded<div class="result-sub">$${GS.spent} spent across all rounds</div>`
    : `✗ ${winnerName.toUpperCase()} WINS — Alice lost<div class="result-sub">$${GS.spent} spent · try different tactics</div>`;
  area.innerHTML = '';
  area.appendChild(banner);

  UI.selectedPollId = null;
  renderAll();

  // Render the endgame feedback panel
  renderFeedback(GS, trueResults, baselineResults);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function handleReset() {
  const mode = GS.mode;
  initGame(mode);
  UI.selectedPollId = null;

  document.getElementById('result-area').innerHTML = '';
  document.getElementById('feedback-panel').innerHTML = '';
  document.getElementById('action-log').innerHTML =
    '<div class="log-entry">// game reset — Bob leads, manipulate to help Alice win</div>';

  renderAll();
}
