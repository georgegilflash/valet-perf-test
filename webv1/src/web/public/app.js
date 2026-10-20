/**
 * Valet Performance Testing Studio (webv1)
 * Main Entry Point and ES Module Orchestrator
 */

import {
  state,
  loadStagesFromLocalStorage,
  loadEnvironmentFromLocalStorage,
  saveEnvironmentToLocalStorage,
  showToast,
  escapeHtml
} from './modules/state.js';

import {
  parseDurationToSecondsClient,
  formatTotalDurationSeconds,
  updateTotalDurationBadge,
  renderStages,
  addStage,
  removeStage,
  updateStageName,
  updateStageDuration,
  resetDefaultStages
} from './modules/stages.view.js';

import {
  createStepInstanceFromTemplate,
  loadCatalogAndPools,
  renderCatalogSelector,
  quickAddStepToSelectedScenario,
  selectActiveScenario,
  addNewScenario,
  removeScenario,
  toggleScenarioEnabled,
  updateScenarioName,
  updateScenarioStageVU,
  addStepToScenario,
  removeStepFromScenario,
  moveStepInScenario,
  toggleStepConfigDrawer,
  onCatalogDragStart,
  onStepDragStart,
  onScenarioDragOver,
  onScenarioDragLeave,
  onScenarioDrop,
  renderSelectedEndpointsConfig,
  updateStepField,
  updateStepDataField,
  updateStepThreshold,
  toggleStepAssertion,
  updateStepSelectionMode,
  updateStepIdList,
  loadDefaultIdsForStep,
  toggleStepThinkTimeRandomizer,
  updateStepFixedThinkTime,
  updateStepThinkMinMax,
  getSavedLayouts,
  saveLayoutsList,
  saveCurrentLayoutPrompt,
  loadSavedLayout,
  deleteSavedLayout,
  openLayoutsManagerModal,
  recordRunInLocalStorage,
  openRecentRunsModal,
  loadScenariosFromRecentServerRun
} from './modules/scenarios.view.js';

import {
  buildScriptJsonFromState,
  syncJsonFromVisualForm,
  validateCurrentEditorJson,
  renderScriptVisualSummary,
  exportScriptJson,
  applyScriptJsonToVisualState,
  importScriptJson
} from './modules/script.view.js';

import {
  initCharts,
  resetLiveViewForNewRun,
  updateLiveHeaderState,
  startPerformanceTest,
  stopPerformanceTest,
  connectSSEStream,
  pushLiveMetricPoint,
  renderLiveTotalsAndTable,
  renderCompletedReportLinks,
  clearLiveConsole
} from './modules/live.view.js';

import { loadReportsHistory } from './modules/reports.view.js';

// ============================================================================
// TAB NAVIGATION & ENVIRONMENT HANDLERS
// ============================================================================
export function switchTab(tabName) {
  state.activeTab = tabName;
  const tabs = ['global', 'scenarios', 'script', 'live', 'reports'];

  tabs.forEach((t) => {
    const viewEl = document.getElementById(`view-${t}`);
    const tabBtn = document.getElementById(`tab-${t}`);
    if (!viewEl || !tabBtn) return;

    if (t === tabName) {
      viewEl.classList.remove('hidden');
      tabBtn.className =
        'px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 bg-sky-600 text-white shadow';
    } else {
      viewEl.classList.add('hidden');
      tabBtn.className =
        'px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800/60';
    }
  });

  if (tabName === 'reports') {
    loadReportsHistory();
  }
}

export function goToScriptScreen() {
  syncJsonFromVisualForm();
  switchTab('script');
}

export function onEnvironmentChange(env, shouldPersist = true) {
  const baseUrlInput = document.getElementById('input-base-url');
  if (!baseUrlInput) return;
  const lowerEnv = String(env || 'QA1').toLowerCase();
  baseUrlInput.value = `https://intserver.${lowerEnv}.flashparking.dev`;
  if (shouldPersist && env) {
    saveEnvironmentToLocalStorage(env);
  }
}

// Wrapper for starting test with navigation
export function handleStartPerformanceTest() {
  startPerformanceTest(switchTab);
}

// ============================================================================
// EXPOSE HANDLERS TO WINDOW FOR INLINE HTML EVENT LISTENERS
// ============================================================================
Object.assign(window, {
  // State & Utilities
  state,
  escapeHtml,
  showToast,

  // Tab & Env
  switchTab,
  goToScriptScreen,
  onEnvironmentChange,

  // Stages View
  parseDurationToSecondsClient,
  formatTotalDurationSeconds,
  updateTotalDurationBadge,
  renderStages,
  addStage,
  removeStage,
  updateStageName,
  updateStageDuration,
  resetDefaultStages,

  // Scenarios & Step Builder View
  createStepInstanceFromTemplate,
  loadCatalogAndPools,
  renderCatalogSelector,
  quickAddStepToSelectedScenario,
  selectActiveScenario,
  addNewScenario,
  removeScenario,
  toggleScenarioEnabled,
  updateScenarioName,
  updateScenarioStageVU,
  addStepToScenario,
  removeStepFromScenario,
  moveStepInScenario,
  toggleStepConfigDrawer,
  onCatalogDragStart,
  onStepDragStart,
  onScenarioDragOver,
  onScenarioDragLeave,
  onScenarioDrop,
  renderSelectedEndpointsConfig,
  updateStepField,
  updateStepDataField,
  updateStepThreshold,
  toggleStepAssertion,
  updateStepSelectionMode,
  updateStepIdList,
  loadDefaultIdsForStep,
  toggleStepThinkTimeRandomizer,
  updateStepFixedThinkTime,
  updateStepThinkMinMax,

  // Layouts & History Modals
  getSavedLayouts,
  saveLayoutsList,
  saveCurrentLayoutPrompt,
  loadSavedLayout,
  deleteSavedLayout,
  openLayoutsManagerModal,
  recordRunInLocalStorage,
  openRecentRunsModal,
  loadScenariosFromRecentServerRun,

  // Script View
  buildScriptJsonFromState,
  syncJsonFromVisualForm,
  validateCurrentEditorJson,
  renderScriptVisualSummary,
  exportScriptJson,
  applyScriptJsonToVisualState,
  importScriptJson,

  // Live View
  initCharts,
  resetLiveViewForNewRun,
  updateLiveHeaderState,
  startPerformanceTest: handleStartPerformanceTest,
  stopPerformanceTest,
  connectSSEStream,
  pushLiveMetricPoint,
  renderLiveTotalsAndTable,
  renderCompletedReportLinks,
  clearLiveConsole,

  // Reports View
  loadReportsHistory
});

// ============================================================================
// APP BOOTSTRAP
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  loadStagesFromLocalStorage();
  loadEnvironmentFromLocalStorage((env) => onEnvironmentChange(env, false));
  await loadCatalogAndPools();
  renderStages();
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
  initCharts();
  connectSSEStream();
  await loadReportsHistory();
});
