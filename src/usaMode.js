'use strict';

// ── USA overworld state ───────────────────────────────────────────────────────
// Tracks which districts have been played and their winners.
// Lives outside GS so it persists across district resets.

export const USA_MAP = {
  view:          'map',   // 'map' | 'district'
  activeStateId: null,
  districtIndex: 0,
  results:       {},      // { stateId: (string|null)[] }  — null = unplayed
};

export function initUSAMode() {
  USA_MAP.view          = 'map';
  USA_MAP.activeStateId = null;
  USA_MAP.districtIndex = 0;
  USA_MAP.results       = {};
}

/** Find the next unplayed district index for a state, or null if all done. */
export function nextDistrictIndex(stateId, totalDistricts) {
  const played = USA_MAP.results[stateId] ?? [];
  for (let i = 0; i < totalDistricts; i++) {
    if (played[i] == null) return i;
  }
  return null;
}

/**
 * Begin playing a specific state's next unplayed district.
 * Returns true if successfully started, false if all districts already played.
 */
export function startDistrict(stateId, totalDistricts) {
  const idx = nextDistrictIndex(stateId, totalDistricts);
  if (idx === null) return false;
  USA_MAP.activeStateId = stateId;
  USA_MAP.districtIndex = idx;
  USA_MAP.view          = 'district';
  return true;
}

/** Persist the winner of the just-completed active district. */
export function recordDistrictResult(winner) {
  const { activeStateId, districtIndex } = USA_MAP;
  if (!activeStateId) return;
  if (!USA_MAP.results[activeStateId]) USA_MAP.results[activeStateId] = [];
  USA_MAP.results[activeStateId][districtIndex] = winner;
}

/** Transition back to the national map view. */
export function returnToMap() {
  USA_MAP.view          = 'map';
  USA_MAP.activeStateId = null;
  USA_MAP.districtIndex = 0;
}
