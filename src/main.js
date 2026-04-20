'use strict';

import { initGame }                                 from './gameState.js';
import { renderAll, handleRunButton, handleReset }  from './ui.js';

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Initialise in curated (classic) mode
  initGame('curated');
  renderAll();

  // Run / Advance button
  document.getElementById('run-btn').addEventListener('click', () => {
    handleRunButton();
  });

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    handleReset();
  });

});
