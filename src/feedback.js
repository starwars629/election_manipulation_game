'use strict';

import { CAND_BY_ID, CANDIDATES } from './models.js';
import { CAMPAIGN_ROUNDS }        from './gameState.js';

// ── Endgame feedback panel ────────────────────────────────────────────────────
//
// Shows: results table, performance stats, baseline comparison, IRV walkthrough.
// The poll grid cards already show real/fake/effective/wasted overlays via ui.js.

/**
 * @param {object} gs             GS state snapshot
 * @param {object} trueResults    { plurality, borda, irv }
 * @param {object} baselineResults
 */
export function renderFeedback(gs, trueResults, baselineResults) {
  const panel = document.getElementById('feedback-panel');
  panel.innerHTML = '';
  panel.classList.remove('hidden');

  panel.appendChild(buildResultsTable(gs, trueResults));
  panel.appendChild(buildPerformanceStats(gs));
  panel.appendChild(buildBaselineComparison(gs, trueResults, baselineResults));
  panel.appendChild(buildIRVWalkthrough(trueResults.irv));
  panel.appendChild(buildSystemComparison(trueResults));
}

// ── Results table ─────────────────────────────────────────────────────────────

function buildResultsTable(gs, trueResults) {
  const sec = section('Election Results (True Ballots)');

  const methods = ['plurality', 'borda', 'irv'];
  const methodLabels = { plurality: 'Plurality', borda: 'Borda Count', irv: 'IRV' };

  const table = document.createElement('div');
  table.className = 'results-table';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'rt-header';
  hdr.innerHTML = `<div class="rt-method"></div>${CANDIDATES.map(c =>
    `<div class="rt-cand" style="color:${c.cssVar}">${c.name}</div>`
  ).join('')}`;
  table.appendChild(hdr);

  methods.forEach(m => {
    const res    = trueResults[m];
    const winner = res.winner;
    const row    = document.createElement('div');
    row.className = 'rt-row' + (m === gs.method ? ' active-method' : '');

    const methodCell = document.createElement('div');
    methodCell.className = 'rt-method-label';
    methodCell.textContent = methodLabels[m];
    row.appendChild(methodCell);

    CANDIDATES.forEach(c => {
      const cell = document.createElement('div');
      cell.className = 'rt-score' + (c.id === winner ? ' winner-cell' : '');
      const score = Math.round(res.scores[c.id] ?? 0);
      cell.innerHTML = `${score}${c.id === winner ? ' <span class="win-star">★</span>' : ''}`;
      row.appendChild(cell);
    });

    table.appendChild(row);
  });

  sec.appendChild(table);
  return sec;
}

// ── Performance stats ─────────────────────────────────────────────────────────

function buildPerformanceStats(gs) {
  const sec = section('Your Performance');

  const total = gs.effectiveActions + gs.wastedActions;
  const totalBudget = gs.mode === 'campaign'
    ? CAMPAIGN_ROUNDS.reduce((s, r) => s + r.budget, 0)
    : 1000;
  const efficiency = totalBudget > 0 ? Math.round((1 - gs.spent / totalBudget) * 100) : 100;

  const stats = [
    { label: 'Total actions taken',   value: total },
    { label: 'Effective (hit real ballots)', value: gs.effectiveActions, cls: 'good' },
    { label: 'Wasted (spent on fakes)',      value: gs.wastedActions,    cls: gs.wastedActions > 0 ? 'bad' : '' },
    { label: 'Total budget spent',           value: `$${gs.spent}` },
    { label: 'Budget efficiency',            value: `${efficiency}%`, cls: efficiency > 70 ? 'good' : efficiency > 40 ? 'warn' : 'bad' },
  ];

  const list = document.createElement('div');
  list.className = 'stat-list';
  stats.forEach(({ label, value, cls }) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value ${cls || ''}">${value}</span>`;
    list.appendChild(row);
  });

  sec.appendChild(list);
  return sec;
}

// ── Baseline comparison ───────────────────────────────────────────────────────

function buildBaselineComparison(gs, trueResults, baselineResults) {
  const sec = section('Baseline Comparison (no changes)');

  const methods = ['plurality', 'borda', 'irv'];
  const methodLabels = { plurality: 'Plurality', borda: 'Borda', irv: 'IRV' };

  const rows = methods.map(m => {
    const baseWinner  = baselineResults[m].winner;
    const trueWinner  = trueResults[m].winner;
    const baseC       = CAND_BY_ID[baseWinner];
    const trueC       = CAND_BY_ID[trueWinner];
    const changed     = baseWinner !== trueWinner;

    return `<div class="baseline-row">
      <span class="baseline-method">${methodLabels[m]}</span>
      <span class="baseline-orig" style="color:${baseC?.cssVar || '#aaa'}">
        ${baseC?.name || baseWinner} (original)
      </span>
      <span class="baseline-arrow">${changed ? '→' : '='}</span>
      <span class="baseline-final${trueWinner === 'alice' ? ' you-win' : ''}" style="color:${trueC?.cssVar || '#aaa'}">
        ${trueC?.name || trueWinner}${changed ? ' (changed!)' : ' (unchanged)'}
      </span>
    </div>`;
  }).join('');

  const note = document.createElement('div');
  note.className = 'baseline-note';
  note.innerHTML = `<em>Without any manipulation, the original result was:</em><br>${rows}`;
  sec.appendChild(note);
  return sec;
}

// ── IRV walkthrough ───────────────────────────────────────────────────────────

function buildIRVWalkthrough(irvResult) {
  const sec = section('IRV Walkthrough — Step by Step');

  const note = document.createElement('div');
  note.className = 'irv-note';
  note.innerHTML = '<em>"Borda rewards consistent ranking, not just first-place votes."</em>';
  sec.appendChild(note);

  irvResult.steps.forEach(step => {
    const stepEl = document.createElement('div');
    stepEl.className = 'irv-step';

    const candEntries = step.alive.map(cid => {
      const c = CAND_BY_ID[cid];
      const n = step.counts[cid] ?? 0;
      return `<span style="color:${c?.cssVar || '#aaa'}">${c?.name || cid}=${n}</span>`;
    }).join('  ');

    let action = '';
    if (step.winner) {
      const c = CAND_BY_ID[step.winner];
      action = `<span class="irv-winner">→ ${c?.name || step.winner} wins with majority</span>`;
    } else if (step.eliminated) {
      const c = CAND_BY_ID[step.eliminated];
      action = `<span class="irv-elim">→ ${c?.name || step.eliminated} eliminated</span>`;
    }

    stepEl.innerHTML = `<span class="irv-round">Round ${step.round}:</span> ${candEntries} ${action}`;
    sec.appendChild(stepEl);
  });

  return sec;
}

// ── System comparison ─────────────────────────────────────────────────────────

function buildSystemComparison(trueResults) {
  const sec = section('System Comparison');

  const winners = {
    plurality: trueResults.plurality.winner,
    borda:     trueResults.borda.winner,
    irv:       trueResults.irv.winner,
  };

  const allSame = Object.values(winners).every(w => w === winners.plurality);

  const note = document.createElement('div');
  note.className = 'system-comparison';

  if (allSame) {
    const c = CAND_BY_ID[winners.plurality];
    note.innerHTML = `All three methods agree: <strong style="color:${c?.cssVar || '#aaa'}">${c?.name || winners.plurality}</strong> wins regardless of how votes are counted.`;
  } else {
    const rows = Object.entries(winners).map(([m, wid]) => {
      const c = CAND_BY_ID[wid];
      return `<div><span class="sc-method">${m}:</span> <span style="color:${c?.cssVar || '#aaa'}">${c?.name || wid}</span></div>`;
    }).join('');
    note.innerHTML = `<strong>Different systems produce different winners!</strong><br>${rows}
      <div class="sc-note">This shows how the choice of voting system can determine the outcome.</div>`;
  }

  sec.appendChild(note);
  return sec;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function section(title) {
  const el = document.createElement('div');
  el.className = 'fb-section';
  const h = document.createElement('div');
  h.className = 'fb-section-title';
  h.textContent = title;
  el.appendChild(h);
  return el;
}
