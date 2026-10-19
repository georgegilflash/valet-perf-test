/**
 * Frontend Application Logic for Valet Performance Testing Studio (webv1)
 * Supports Drag & Drop Multi-Step Scenarios, Real-Time Requests Now Chart,
 * and Live + Final Endpoint Telemetry (including p50, p90, p95, p99).
 */

const STAGES_STORAGE_KEY = 'valet_perf_studio_stages_v1';
const ENV_STORAGE_KEY = 'valet_perf_studio_env_v1';

const DEFAULT_STAGES = [
  { name: 'Stage 1 (Warm-up)', duration: '30s' },
  { name: 'Stage 2 (Ramp-up)', duration: '1m' },
  { name: 'Stage 3 (Peak Load)', duration: '2m' },
  { name: 'Stage 4 (Scale-down)', duration: '1m' },
  { name: 'Stage 5 (Cool-down)', duration: '30s' }
];

const state = {
  catalog: [],
  pools: {
    locationIds: [],
    kioskIds: [],
    userGuids: []
  },
  stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)),
  endpointsState: {}, // Template defaults keyed by template.id
  scenarios: [],      // Multi-step scenarios configured by the user
  activeScenarioId: null, // Currently selected scenario to display/configure
  dragPayload: null,  // Active HTML5 drag payload { type: 'catalog'|'step', ... }
  isJsonValid: false,
  lastValidatedScript: null,
  activeTab: 'global',
  sseSource: null,
  charts: {
    requestsNow: null,
    throughput: null,
    latency: null
  }
};

function loadStagesFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(STAGES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validStages = parsed
        .filter((st) => st && typeof st.duration === 'string' && st.duration.trim().length > 0)
        .map((st, idx) => ({
          name: typeof st.name === 'string' && st.name.trim() ? st.name : `Stage ${idx + 1}`,
          duration: st.duration.trim()
        }));
      if (validStages.length > 0) {
        state.stages = validStages;
      }
    }
  } catch (err) {
    console.warn('Could not load saved stages from localStorage:', err);
  }
}

function saveStagesToLocalStorage() {
  try {
    window.localStorage.setItem(STAGES_STORAGE_KEY, JSON.stringify(state.stages));
  } catch (err) {
    console.warn('Could not save stages to localStorage:', err);
  }
}

function loadEnvironmentFromLocalStorage() {
  try {
    const savedEnv = window.localStorage.getItem(ENV_STORAGE_KEY);
    if (!savedEnv) return;
    const envSelect = document.getElementById('input-environment');
    if (envSelect && ['QA1', 'QA2', 'QA3'].includes(savedEnv)) {
      envSelect.value = savedEnv;
      onEnvironmentChange(savedEnv, false);
    }
  } catch (err) {
    console.warn('Could not load saved environment from localStorage:', err);
  }
}

function saveEnvironmentToLocalStorage(env) {
  try {
    window.localStorage.setItem(ENV_STORAGE_KEY, env);
  } catch (err) {
    console.warn('Could not save environment to localStorage:', err);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  loadStagesFromLocalStorage();
  loadEnvironmentFromLocalStorage();
  await loadCatalogAndPools();
  renderStages();
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
  initCharts();
  connectSSEStream();
  await loadReportsHistory();
});

function createStepInstanceFromTemplate(epId, openDrawer = true) {
  const tpl = state.endpointsState[epId];
  if (!tpl) return null;

  const cloned = JSON.parse(JSON.stringify(tpl));
  return {
    ...cloned,
    stepId: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    endpointId: tpl.id,
    id: tpl.id,
    enabled: true,
    drawerOpen: Boolean(openDrawer)
  };
}

async function loadCatalogAndPools() {
  try {
    const res = await fetch('/api/catalog');
    const data = await res.json();
    state.catalog = data.catalog || [];
    state.pools = data.pools || { locationIds: [], kioskIds: [], userGuids: [] };

    state.catalog.forEach((tpl) => {
      const primaryPool = tpl.dataRequirements?.primaryIdPool;
      const poolKey = primaryPool?.key || 'locationIds';
      const fullPoolList = state.pools[poolKey] || [];
      const defaultSliceCount = primaryPool?.defaultCount || fullPoolList.length || 5;
      const defaultConfirmedIds = fullPoolList.slice(0, defaultSliceCount);

      const alignedUsersPerStage = state.stages.map((_, idx) => {
        if (Array.isArray(tpl.defaultUsersPerStage) && tpl.defaultUsersPerStage[idx] !== undefined) {
          return tpl.defaultUsersPerStage[idx];
        }
        return 5;
      });

      state.endpointsState[tpl.id] = {
        id: tpl.id,
        name: tpl.name,
        displayName: tpl.displayName || tpl.name,
        category: tpl.category || 'SOAP Service',
        description: tpl.description || '',
        enabled: true,
        protocol: tpl.protocol || 'SOAP',
        soapVersion: tpl.soapVersion || '1.1',
        service: tpl.service || '/device/pms.asmx',
        soapAction: tpl.soapAction || null,
        operationName: tpl.operationName || 'Ping',
        xmlNamespace: tpl.xmlNamespace || 'http://tempuri.org/',
        timeout: tpl.defaultTimeout || '60s',
        thinkTimeSec: tpl.defaultThinkTimeSec ?? 1.0,
        usersPerStage: alignedUsersPerStage,
        dataRequirements: JSON.parse(JSON.stringify(tpl.dataRequirements || {})),
        data: {
          selectionMode: primaryPool?.defaultSelectionMode || 'random',
          xmlElement: primaryPool?.xmlElement || 'id',
          sourcePoolFile: `data/${primaryPool?.poolFile || 'location-ids.json'}`,
          [poolKey]: [...defaultConfirmedIds],
          dateRange: {
            enabled: Boolean(tpl.dataRequirements?.usesDateRange),
            fromMin: '2026-01-01T00:00:00Z',
            fromMax: '2026-12-31T23:59:59Z'
          },
          quantities: {
            enabled: Boolean(tpl.dataRequirements?.usesQuantities),
            min: 1,
            max: 10
          }
        },
        thresholds: {
          p95MaxDurationMs: tpl.defaultThresholds?.p95MaxDurationMs ?? 5000,
          maxErrorRate: tpl.defaultThresholds?.maxErrorRate ?? 0.01
        },
        assertions: (tpl.availableAssertions || []).map((a) => ({
          id: a.id,
          label: a.label,
          type: a.type,
          expected: a.expected,
          description: a.description,
          enabled: a.defaultEnabled !== false
        }))
      };
    });

    // Initialize default scenarios from catalog so the user starts with ready-to-run scenarios
    if (state.scenarios.length === 0) {
      state.catalog.forEach((tpl, idx) => {
        const epDefault = state.endpointsState[tpl.id];
        const firstStep = createStepInstanceFromTemplate(tpl.id, true);
        state.scenarios.push({
          id: `scenario_${idx + 1}`,
          name: `Scenario ${idx + 1}: ${tpl.name}`,
          enabled: true,
          usersPerStage: [...(epDefault?.usersPerStage || state.stages.map(() => 5))],
          steps: firstStep ? [firstStep] : []
        });
      });
    }
    if (!state.activeScenarioId && state.scenarios.length > 0) {
      state.activeScenarioId = state.scenarios[0].id;
    }
  } catch (err) {
    console.error('Error loading catalog and pools:', err);
    showToast('Failed to load endpoint catalog from server.', 'error');
  }
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================
function switchTab(tabName) {
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

function goToScriptScreen() {
  syncJsonFromVisualForm();
  switchTab('script');
}

function onEnvironmentChange(env, shouldPersist = true) {
  const baseUrlInput = document.getElementById('input-base-url');
  if (!baseUrlInput) return;
  const lowerEnv = String(env || 'QA1').toLowerCase();
  baseUrlInput.value = `https://intserver.${lowerEnv}.flashparking.dev`;
  if (shouldPersist && env) {
    saveEnvironmentToLocalStorage(env);
  }
}

// ============================================================================
// VIEW 1: GLOBAL STAGES & SCENARIOS / STEPS BUILDER (DRAG & DROP)
// ============================================================================
function parseDurationToSecondsClient(durationStr) {
  if (typeof durationStr !== 'string') return 0;
  const match = durationStr.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'ms') return val / 1000;
  if (unit === 's') return val;
  if (unit === 'm') return val * 60;
  if (unit === 'h') return val * 3600;
  return 0;
}

function formatTotalDurationSeconds(sec) {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0 && s > 0) return `${m}m ${s}s (${sec}s)`;
  if (m > 0) return `${m}m (${sec}s)`;
  return `${s}s`;
}

function updateTotalDurationBadge() {
  const badge = document.getElementById('total-duration-badge');
  if (!badge) return;
  const totalSec = state.stages.reduce((acc, st) => acc + parseDurationToSecondsClient(st.duration), 0);
  badge.textContent = `Total Duration: ${formatTotalDurationSeconds(totalSec)}`;
}

function renderStages() {
  const container = document.getElementById('stages-container');
  if (!container) return;

  container.innerHTML = state.stages
    .map(
      (st, idx) => `
      <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 relative">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-wider text-sky-400">
            Stage #${idx + 1}
          </span>
          ${
            state.stages.length > 1
              ? `<button onclick="removeStage(${idx})" class="text-[11px] text-slate-500 hover:text-rose-400 transition" title="Remove stage">✕</button>`
              : ''
          }
        </div>
        <div>
          <label class="block text-[10px] text-slate-400 mb-0.5">Stage Label</label>
          <input type="text" value="${escapeHtml(st.name || `Stage ${idx + 1}`)}"
            oninput="updateStageName(${idx}, this.value)"
            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500" />
        </div>
        <div>
          <label class="block text-[10px] text-slate-400 mb-0.5">Duration (e.g. 30s, 1m)</label>
          <input type="text" value="${escapeHtml(st.duration)}"
            oninput="updateStageDuration(${idx}, this.value)"
            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:border-sky-500" />
        </div>
      </div>
    `
    )
    .join('');

  updateTotalDurationBadge();
}

function addStage() {
  const nextNum = state.stages.length + 1;
  state.stages.push({ name: `Stage ${nextNum}`, duration: '30s' });
  saveStagesToLocalStorage();
  Object.values(state.endpointsState).forEach((ep) => {
    const prevVu = ep.usersPerStage[ep.usersPerStage.length - 1] ?? 5;
    ep.usersPerStage.push(prevVu);
  });
  state.scenarios.forEach((sc) => {
    const prevVu = sc.usersPerStage[sc.usersPerStage.length - 1] ?? 5;
    sc.usersPerStage.push(prevVu);
  });
  renderStages();
  renderSelectedEndpointsConfig();
}

function removeStage(idx) {
  if (state.stages.length <= 1) return;
  state.stages.splice(idx, 1);
  saveStagesToLocalStorage();
  Object.values(state.endpointsState).forEach((ep) => {
    ep.usersPerStage.splice(idx, 1);
  });
  state.scenarios.forEach((sc) => {
    sc.usersPerStage.splice(idx, 1);
  });
  renderStages();
  renderSelectedEndpointsConfig();
}

function updateStageName(idx, val) {
  if (state.stages[idx]) {
    state.stages[idx].name = val;
    saveStagesToLocalStorage();
    document.querySelectorAll(`.ep-stage-header-${idx}`).forEach((el) => {
      el.textContent = `S${idx + 1} (${state.stages[idx].duration})`;
    });
  }
}

function updateStageDuration(idx, val) {
  if (state.stages[idx]) {
    state.stages[idx].duration = val.trim();
    saveStagesToLocalStorage();
    updateTotalDurationBadge();
    document.querySelectorAll(`.ep-stage-header-${idx}`).forEach((el) => {
      el.textContent = `S${idx + 1} (${state.stages[idx].duration})`;
    });
  }
}

function resetDefaultStages() {
  state.stages = JSON.parse(JSON.stringify(DEFAULT_STAGES));
  saveStagesToLocalStorage();

  state.catalog.forEach((tpl) => {
    const ep = state.endpointsState[tpl.id];
    if (ep) {
      ep.usersPerStage = state.stages.map((_, idx) => {
        if (Array.isArray(tpl.defaultUsersPerStage) && tpl.defaultUsersPerStage[idx] !== undefined) {
          return tpl.defaultUsersPerStage[idx];
        }
        return 5;
      });
    }
  });

  state.scenarios.forEach((sc) => {
    sc.usersPerStage = state.stages.map((_, idx) => sc.usersPerStage[idx] ?? 5);
  });

  renderStages();
  renderSelectedEndpointsConfig();
  showToast('Restored default global stage durations.', 'info');
}

// ============================================================================
// DRAGGABLE ENDPOINT CATALOG & MULTI-STEP SCENARIOS
// ============================================================================
function renderCatalogSelector() {
  const grid = document.getElementById('catalog-selector-grid');
  if (!grid) return;

  const scenarioOptionsHtml = state.scenarios
    .map(
      (sc, i) =>
        `<option value="${escapeHtml(sc.id)}" ${sc.id === state.activeScenarioId ? 'selected' : ''}>Scenario #${i + 1}: ${escapeHtml(sc.name)}</option>`
    )
    .join('');

  grid.innerHTML = Object.values(state.endpointsState)
    .map((ep) => {
      return `
        <div draggable="true"
          ondragstart="onCatalogDragStart(event, '${ep.id}')"
          class="cursor-grab active:cursor-grabbing rounded-xl border border-sky-500/40 bg-slate-950/90 hover:border-sky-400 p-4 transition shadow-md space-y-3 select-none">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold">⠿ DRAG</span>
                <span class="text-sm font-bold text-white font-mono">${escapeHtml(ep.name)}</span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
                  SOAP ${escapeHtml(ep.soapVersion)}
                </span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400">
                  ${escapeHtml(ep.service)}
                </span>
              </div>
            </div>
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">${escapeHtml(ep.description)}</p>

          <!-- Quick Add to Scenario Controls -->
          <div class="pt-2 border-t border-slate-800/80 flex flex-wrap sm:flex-nowrap items-center gap-2">
            <select id="quick-add-target-${ep.id}"
              class="w-full sm:w-auto flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500 truncate"
              title="Select target scenario">
              ${scenarioOptionsHtml || '<option value="">No Scenarios</option>'}
            </select>
            <button onclick="quickAddStepToSelectedScenario('${ep.id}')"
              class="w-full sm:w-auto shrink-0 px-2.5 py-1 rounded-lg bg-sky-600/30 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/40 text-[11px] font-semibold transition text-center whitespace-nowrap">
              + Add Step
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function quickAddStepToSelectedScenario(epId) {
  if (state.scenarios.length === 0) {
    addNewScenario(epId);
    return;
  }
  const selectEl = document.getElementById(`quick-add-target-${epId}`);
  const targetScId = selectEl?.value || state.activeScenarioId || state.scenarios[0].id;
  addStepToScenario(targetScId, epId);
}

function selectActiveScenario(scenarioId) {
  state.activeScenarioId = scenarioId;
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
}

function addNewScenario(initialEndpointId = null) {
  const nextNum = state.scenarios.length + 1;
  const defaultEpId = initialEndpointId || Object.keys(state.endpointsState)[0] || 'callPMSNewMessages';
  const firstStep = createStepInstanceFromTemplate(defaultEpId, true);

  const newSc = {
    id: `scenario_${Date.now()}_${nextNum}`,
    name: `Scenario ${nextNum}: Custom Flow`,
    enabled: true,
    usersPerStage: state.stages.map((_, i) => (i === 2 ? 10 : 5)),
    steps: firstStep ? [firstStep] : []
  };

  state.scenarios.push(newSc);
  state.activeScenarioId = newSc.id;
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
  showToast(`Added ${newSc.name}`, 'info');
}

function removeScenario(scenarioId) {
  state.scenarios = state.scenarios.filter((sc) => sc.id !== scenarioId);
  if (state.activeScenarioId === scenarioId) {
    state.activeScenarioId = state.scenarios[0]?.id || null;
  }
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
}

function toggleScenarioEnabled(scenarioId, checked) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.enabled = Boolean(checked);
  renderSelectedEndpointsConfig();
}

function updateScenarioName(scenarioId, newName) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.name = newName;
  renderCatalogSelector();
}

function updateScenarioStageVU(scenarioId, stageIdx, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.usersPerStage[stageIdx] = Math.max(0, parseInt(val, 10) || 0);
  const peakEl = document.getElementById(`peak-vu-${scenarioId}`);
  if (peakEl) {
    peakEl.textContent = String(Math.max(...sc.usersPerStage, 0));
  }
}

function addStepToScenario(scenarioId, endpointId, insertIndex = null) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  const newStep = createStepInstanceFromTemplate(endpointId, false);
  if (!newStep) return;

  if (insertIndex !== null && insertIndex >= 0 && insertIndex <= sc.steps.length) {
    sc.steps.splice(insertIndex, 0, newStep);
  } else {
    sc.steps.push(newStep);
  }

  renderSelectedEndpointsConfig();
  showToast(`Added step "${newStep.name}" to ${sc.name}`, 'info');
}

function removeStepFromScenario(scenarioId, stepIndex) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.steps.splice(stepIndex, 1);
  renderSelectedEndpointsConfig();
}

function moveStepInScenario(scenarioId, stepIndex, direction) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  const targetIdx = stepIndex + direction;
  if (targetIdx < 0 || targetIdx >= sc.steps.length) return;
  const [moved] = sc.steps.splice(stepIndex, 1);
  sc.steps.splice(targetIdx, 0, moved);
  renderSelectedEndpointsConfig();
}

function toggleStepConfigDrawer(scenarioId, stepIndex) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIndex]) return;
  sc.steps[stepIndex].drawerOpen = !sc.steps[stepIndex].drawerOpen;
  renderSelectedEndpointsConfig();
}

// HTML5 Drag & Drop Handlers
function onCatalogDragStart(event, endpointId) {
  state.dragPayload = {
    type: 'catalog',
    endpointId
  };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', JSON.stringify(state.dragPayload));
  }
}

function onStepDragStart(event, sourceScenarioId, sourceStepIndex) {
  event.stopPropagation();
  state.dragPayload = {
    type: 'step',
    sourceScenarioId,
    sourceStepIndex
  };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(state.dragPayload));
  }
}

function onScenarioDragOver(event, scenarioId) {
  event.preventDefault();
  const dropZone = document.getElementById(`scenario-dropzone-${scenarioId}`);
  if (dropZone) {
    dropZone.classList.add('border-sky-400', 'bg-sky-950/30');
  }
}

function onScenarioDragLeave(event, scenarioId) {
  const dropZone = document.getElementById(`scenario-dropzone-${scenarioId}`);
  if (dropZone) {
    dropZone.classList.remove('border-sky-400', 'bg-sky-950/30');
  }
}

function onScenarioDrop(event, targetScenarioId, targetStepIndex = null) {
  event.preventDefault();
  event.stopPropagation();

  const dropZone = document.getElementById(`scenario-dropzone-${targetScenarioId}`);
  if (dropZone) {
    dropZone.classList.remove('border-sky-400', 'bg-sky-950/30');
  }

  let payload = state.dragPayload;
  if (!payload && event.dataTransfer) {
    try {
      payload = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (_) {
      payload = null;
    }
  }
  state.dragPayload = null;
  if (!payload) return;

  if (payload.type === 'catalog' && payload.endpointId) {
    addStepToScenario(targetScenarioId, payload.endpointId, targetStepIndex);
    return;
  }

  if (payload.type === 'step') {
    const sourceSc = state.scenarios.find((s) => s.id === payload.sourceScenarioId);
    const targetSc = state.scenarios.find((s) => s.id === targetScenarioId);
    if (!sourceSc || !targetSc) return;

    const [movedStep] = sourceSc.steps.splice(payload.sourceStepIndex, 1);
    if (!movedStep) return;

    if (targetStepIndex !== null && targetStepIndex >= 0 && targetStepIndex <= targetSc.steps.length) {
      targetSc.steps.splice(targetStepIndex, 0, movedStep);
    } else {
      targetSc.steps.push(movedStep);
    }
    renderSelectedEndpointsConfig();
  }
}

function renderSelectedEndpointsConfig() {
  const container = document.getElementById('selected-endpoints-config');
  if (!container) return;

  if (state.scenarios.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-6 text-center space-y-3">
        <div class="text-amber-300 text-xs font-semibold">
          ⚠️ No scenarios are configured yet. Click "+ New Scenario" to create a scenario and drag endpoints into it.
        </div>
        <button onclick="addNewScenario()"
          class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition">
          + Create First Scenario
        </button>
      </div>
    `;
    return;
  }

  // Ensure activeScenarioId points to an existing scenario
  if (!state.activeScenarioId || !state.scenarios.some((s) => s.id === state.activeScenarioId)) {
    state.activeScenarioId = state.scenarios[0].id;
  }

  const activeSc = state.scenarios.find((s) => s.id === state.activeScenarioId) || state.scenarios[0];
  const scIdx = state.scenarios.findIndex((s) => s.id === activeSc.id);

  // Scenario Selector Bar (Tabs / Pills)
  const scenarioTabsHtml = `
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1.5">
          <span>🎯 Select Scenario:</span>
        </span>
        ${state.scenarios
          .map((sc, i) => {
            const isSelected = sc.id === activeSc.id;
            const peakVu = Math.max(...(sc.usersPerStage || [0]), 0);
            return `
              <button onclick="selectActiveScenario('${sc.id}')"
                class="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-sky-600 text-white border-sky-400 shadow-md shadow-sky-600/20'
                    : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border-slate-800'
                } ${!sc.enabled ? 'opacity-60 line-through' : ''}">
                <span class="w-5 h-5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-800'} flex items-center justify-center text-[11px] font-bold">
                  ${i + 1}
                </span>
                <span class="max-w-[140px] truncate text-left">${escapeHtml(sc.name)}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-sky-800 text-sky-100' : 'bg-slate-900 text-slate-400'} font-mono">
                  ${peakVu} VU · ${sc.steps.length} step${sc.steps.length === 1 ? '' : 's'}
                </span>
              </button>
            `;
          })
          .join('')}
      </div>

      <button onclick="addNewScenario()"
        class="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-xs font-bold transition flex items-center gap-1">
        <span>+ Add Scenario</span>
      </button>
    </div>
  `;

  // Render Details for ONLY the active scenario
  const sc = activeSc;
  const stagesInputsHtml = state.stages
    .map(
      (st, sIdx) => `
      <div class="bg-slate-950 border border-slate-800 rounded-xl p-2">
        <label class="block text-[10px] text-slate-400 truncate mb-1 ep-stage-header-${sIdx}">
          S${sIdx + 1} (${escapeHtml(st.duration)})
        </label>
        <div class="flex items-center gap-1">
          <input type="number" min="0" max="5000" value="${sc.usersPerStage[sIdx] ?? 0}"
            oninput="updateScenarioStageVU('${sc.id}', ${sIdx}, this.value)"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold font-mono text-sky-300 focus:outline-none focus:border-sky-500" />
          <span class="text-[10px] text-slate-500 font-semibold">VUs</span>
        </div>
      </div>
    `
    )
    .join('');

  const stepsListHtml =
    sc.steps.length === 0
      ? `<div class="p-6 text-center text-xs text-slate-400 border-2 border-dashed border-slate-800 rounded-xl">
          Drag & Drop an endpoint card from the left catalog here, or click <strong>"+ Add Step"</strong> on any catalog endpoint.
         </div>`
      : sc.steps
          .map((step, stepIdx) => {
            const primaryPool = step.dataRequirements?.primaryIdPool || {
              key: 'locationIds',
              poolFile: 'location-ids.json',
              xmlElement: 'companyLocationID',
              label: 'Confirmed IDs'
            };
            const poolKey = primaryPool.key;
            const currentIds = step.data?.[poolKey] || [];
            const defaultPoolList = state.pools[poolKey] || [];
            const activeAssertionsCount = (step.assertions || []).filter((a) => a.enabled).length;

            const assertionsHtml = (step.assertions || [])
              .map(
                (asrt, aIdx) => `
                <label class="flex items-start gap-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 cursor-pointer transition">
                  <input type="checkbox" ${asrt.enabled ? 'checked' : ''}
                    onchange="toggleStepAssertion('${sc.id}', ${stepIdx}, ${aIdx}, this.checked)"
                    class="mt-0.5 rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-sky-500" />
                  <div class="text-[11px]">
                    <div class="font-semibold text-slate-200 font-mono">${escapeHtml(asrt.label)}</div>
                    <div class="text-[10px] text-slate-400">${escapeHtml(asrt.description || asrt.type)}</div>
                  </div>
                </label>
              `
              )
              .join('');

            return `
              <div draggable="true"
                ondragstart="onStepDragStart(event, '${sc.id}', ${stepIdx})"
                ondragover="event.preventDefault()"
                ondrop="onScenarioDrop(event, '${sc.id}', ${stepIdx})"
                class="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 space-y-3 transition shadow">
                <!-- Step Header Row -->
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2.5 flex-wrap">
                    <span class="cursor-grab active:cursor-grabbing px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-xs font-bold" title="Drag to reorder step">
                      ⠿ Step ${stepIdx + 1}
                    </span>
                    <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono text-xs font-bold">
                      ${escapeHtml(step.name)}
                    </span>
                    <span class="text-[11px] font-mono text-slate-400">
                      ${escapeHtml(step.service)} · SOAP ${escapeHtml(step.soapVersion)}
                    </span>
                    <span id="step-id-badge-${sc.id}-${stepIdx}" class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono">
                      ${currentIds.length} IDs (${escapeHtml(step.data?.selectionMode || 'random')})
                    </span>
                  </div>

                  <!-- Step Action Buttons -->
                  <div class="flex items-center gap-1.5">
                    <button onclick="toggleStepConfigDrawer('${sc.id}', ${stepIdx})"
                      class="px-2.5 py-1 rounded-lg ${
                        step.drawerOpen
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700'
                      } text-[11px] font-semibold transition">
                      ⚙️ ${step.drawerOpen ? 'Hide Step Config' : 'Configure IDs & SLA'}
                    </button>
                    <button onclick="moveStepInScenario('${sc.id}', ${stepIdx}, -1)"
                      ${stepIdx === 0 ? 'disabled' : ''}
                      class="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 border border-slate-800 text-xs"
                      title="Move Step Up">↑</button>
                    <button onclick="moveStepInScenario('${sc.id}', ${stepIdx}, 1)"
                      ${stepIdx === sc.steps.length - 1 ? 'disabled' : ''}
                      class="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 border border-slate-800 text-xs"
                      title="Move Step Down">↓</button>
                    <button onclick="removeStepFromScenario('${sc.id}', ${stepIdx})"
                      class="px-2 py-1 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs"
                      title="Remove Step">✕</button>
                  </div>
                </div>

                <!-- Collapsible Step Configuration Drawer -->
                <div class="${step.drawerOpen ? 'block' : 'hidden'} pt-3 border-t border-slate-800/90 space-y-4">
                  <!-- Timeout, Think Time, SLA p95 -->
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                      <label class="block text-[10px] text-slate-400">Step Timeout (e.g. 60s)</label>
                      <input type="text" value="${escapeHtml(step.timeout)}"
                        oninput="updateStepField('${sc.id}', ${stepIdx}, 'timeout', this.value)"
                        class="w-full bg-transparent text-xs font-mono text-white focus:outline-none" />
                    </div>
                    <div class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                      <label class="block text-[10px] text-slate-400">Think Time After Step (s)</label>
                      <input type="number" step="0.1" min="0" value="${step.thinkTimeSec}"
                        oninput="updateStepField('${sc.id}', ${stepIdx}, 'thinkTimeSec', parseFloat(this.value) || 0)"
                        class="w-full bg-transparent text-xs font-mono text-emerald-300 focus:outline-none" />
                    </div>
                    <div class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                      <label class="block text-[10px] text-slate-400">Threshold p95 (ms)</label>
                      <input type="number" step="100" min="100" value="${step.thresholds?.p95MaxDurationMs ?? 5000}"
                        oninput="updateStepThreshold('${sc.id}', ${stepIdx}, 'p95MaxDurationMs', parseInt(this.value, 10) || 1000)"
                        class="w-full bg-transparent text-xs font-mono text-amber-300 focus:outline-none" />
                    </div>
                  </div>

                  <!-- Confirmed IDs & Assertions Grid -->
                  <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <!-- Confirmed IDs Pool -->
                    <div class="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h5 class="text-xs font-bold text-slate-200">🗂️ ${escapeHtml(primaryPool.label)}</h5>
                          <p class="text-[10px] text-slate-400">
                            XML Tag: <code class="text-sky-300">&lt;${escapeHtml(primaryPool.xmlElement)}&gt;</code> · Pool: <code class="text-slate-300">data/${escapeHtml(primaryPool.poolFile)}</code>
                          </p>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <select onchange="updateStepSelectionMode('${sc.id}', ${stepIdx}, this.value)"
                            class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none">
                            <option value="random" ${step.data?.selectionMode === 'random' ? 'selected' : ''}>Random per Request</option>
                            <option value="per-vu" ${step.data?.selectionMode === 'per-vu' ? 'selected' : ''}>Dedicated per VU (__VU)</option>
                          </select>
                          <button onclick="loadDefaultIdsForStep('${sc.id}', ${stepIdx}, '${poolKey}', ${primaryPool.defaultCount || 15})"
                            class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition">
                            ↺ Default (${primaryPool.defaultCount || 15})
                          </button>
                          <button onclick="loadDefaultIdsForStep('${sc.id}', ${stepIdx}, '${poolKey}', ${defaultPoolList.length})"
                            class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-300 transition">
                            All (${defaultPoolList.length})
                          </button>
                        </div>
                      </div>
                      <textarea id="textarea-step-ids-${sc.id}-${stepIdx}" rows="3" spellcheck="false"
                        oninput="updateStepIdList('${sc.id}', ${stepIdx}, '${poolKey}', this.value)"
                        class="code-editor w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 focus:outline-none focus:border-sky-500 custom-scrollbar"
                        placeholder="Enter one ID/GUID per line...">${escapeHtml(currentIds.join('\n'))}</textarea>
                    </div>

                    <!-- Step Assertions -->
                    <div class="lg:col-span-5 space-y-2">
                      <div class="text-xs font-bold text-slate-300">
                        ✅ Assertions (${activeAssertionsCount}/${(step.assertions || []).length} active)
                      </div>
                      <div class="space-y-1.5">
                        ${assertionsHtml}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

  const activeScenarioCardHtml = `
    <div class="bg-slate-900 border ${
      sc.enabled ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
    } rounded-2xl p-5 space-y-4 shadow-lg">
      <!-- Scenario Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div class="flex items-center gap-3 flex-1 min-w-[240px]">
          <input type="checkbox" ${sc.enabled ? 'checked' : ''}
            onchange="toggleScenarioEnabled('${sc.id}', this.checked)"
            class="w-4 h-4 rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-sky-500 cursor-pointer" />
          <span class="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-xs font-bold">
            Scenario #${scIdx + 1}
          </span>
          <input type="text" value="${escapeHtml(sc.name)}"
            oninput="updateScenarioName('${sc.id}', this.value)"
            class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-sky-500" />
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-sky-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
            Peak: <strong id="peak-vu-${sc.id}">${Math.max(...sc.usersPerStage, 0)}</strong> VUs · <strong>${sc.steps.length}</strong> Step(s)
          </span>
          ${
            state.scenarios.length > 1
              ? `<button onclick="removeScenario('${sc.id}')"
                  class="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-semibold transition">
                  🗑 Remove Scenario
                </button>`
              : ''
          }
        </div>
      </div>

      <!-- Scenario Target Virtual Users per Stage -->
      <div>
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
          👥 Scenario Target Virtual Users (VUs) per Stage
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          ${stagesInputsHtml}
        </div>
      </div>

      <!-- Sequential Steps Dropzone -->
      <div id="scenario-dropzone-${sc.id}"
        ondragover="onScenarioDragOver(event, '${sc.id}')"
        ondragleave="onScenarioDragLeave(event, '${sc.id}')"
        ondrop="onScenarioDrop(event, '${sc.id}')"
        class="bg-slate-950/60 border-2 border-dashed border-slate-800 rounded-2xl p-4 space-y-3 transition">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-2">
            <span>🔗 Sequential Steps in this Scenario (Executed in order per VU iteration)</span>
          </div>
          <span class="text-[11px] text-slate-400">
            Drop endpoints here or drag steps to reorder
          </span>
        </div>
        <div class="space-y-2.5">
          ${stepsListHtml}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = scenarioTabsHtml + activeScenarioCardHtml;
}

// Step-level Updaters
function updateStepField(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  sc.steps[stepIdx][field] = val;
}

function updateStepThreshold(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  if (!sc.steps[stepIdx].thresholds) sc.steps[stepIdx].thresholds = {};
  sc.steps[stepIdx].thresholds[field] = val;
}

function toggleStepAssertion(scenarioId, stepIdx, assertionIdx, checked) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx] || !sc.steps[stepIdx].assertions?.[assertionIdx]) return;
  sc.steps[stepIdx].assertions[assertionIdx].enabled = Boolean(checked);
}

function updateStepSelectionMode(scenarioId, stepIdx, mode) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  sc.steps[stepIdx].data.selectionMode = mode;
  const primaryPool = sc.steps[stepIdx].dataRequirements?.primaryIdPool || { key: 'locationIds' };
  const count = (sc.steps[stepIdx].data[primaryPool.key] || []).length;
  const badge = document.getElementById(`step-id-badge-${scenarioId}-${stepIdx}`);
  if (badge) badge.textContent = `${count} IDs (${mode})`;
}

function updateStepIdList(scenarioId, stepIdx, poolKey, rawText) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const list = rawText
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  sc.steps[stepIdx].data[poolKey] = list;

  const badge = document.getElementById(`step-id-badge-${scenarioId}-${stepIdx}`);
  if (badge) {
    badge.textContent = `${list.length} IDs (${sc.steps[stepIdx].data.selectionMode || 'random'})`;
  }
}

function loadDefaultIdsForStep(scenarioId, stepIdx, poolKey, count) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const fullPool = state.pools[poolKey] || [];
  const sliced = fullPool.slice(0, count);
  sc.steps[stepIdx].data[poolKey] = [...sliced];

  const textarea = document.getElementById(`textarea-step-ids-${scenarioId}-${stepIdx}`);
  if (textarea) {
    textarea.value = sliced.join('\n');
  }
  const badge = document.getElementById(`step-id-badge-${scenarioId}-${stepIdx}`);
  if (badge) {
    badge.textContent = `${sliced.length} IDs (${sc.steps[stepIdx].data.selectionMode || 'random'})`;
  }
  showToast(`Loaded ${sliced.length} IDs from data/${poolKey}.json`, 'info');
}

// ============================================================================
// VIEW 2: test-performance-script GENERATION, IMPORT/EXPORT & VALIDATION
// ============================================================================
function buildScriptJsonFromState() {
  const testName = document.getElementById('input-test-name')?.value?.trim() || 'Valet SOAP Performance Test';
  const environment = document.getElementById('input-environment')?.value || 'QA1';
  const baseUrl = document.getElementById('input-base-url')?.value?.trim() || 'https://intserver.qa1.flashparking.dev';

  const scenarios = state.scenarios.map((sc) => ({
    id: sc.id,
    name: sc.name,
    enabled: sc.enabled !== false,
    usersPerStage: [...sc.usersPerStage],
    steps: sc.steps.map((st) => ({
      stepId: st.stepId,
      endpointId: st.endpointId || st.id,
      id: st.endpointId || st.id,
      name: st.name,
      displayName: st.displayName,
      category: st.category,
      enabled: st.enabled !== false,
      protocol: st.protocol,
      soapVersion: st.soapVersion,
      service: st.service,
      soapAction: st.soapAction,
      operationName: st.operationName,
      xmlNamespace: st.xmlNamespace,
      timeout: st.timeout,
      thinkTimeSec: st.thinkTimeSec,
      data: JSON.parse(JSON.stringify(st.data)),
      thresholds: JSON.parse(JSON.stringify(st.thresholds)),
      assertions: JSON.parse(JSON.stringify(st.assertions))
    }))
  }));

  // Also build aggregated distinct endpoints array for backward compatibility and reporting
  const distinctMap = new Map();
  scenarios
    .filter((sc) => sc.enabled !== false)
    .forEach((sc) => {
      sc.steps.forEach((st) => {
        const epId = st.endpointId || st.id;
        if (!distinctMap.has(epId)) {
          distinctMap.set(epId, {
            ...JSON.parse(JSON.stringify(st)),
            id: epId,
            usersPerStage: [...sc.usersPerStage]
          });
        } else {
          const existing = distinctMap.get(epId);
          existing.usersPerStage = existing.usersPerStage.map(
            (vu, idx) => Math.max(vu, Number(sc.usersPerStage[idx]) || 0)
          );
        }
      });
    });

  return {
    scriptName: 'test-performance-script',
    version: '1.1.0',
    generatedAt: new Date().toISOString(),
    globalConfig: {
      testName,
      environment,
      baseUrl,
      maxErrorRate: 0.01,
      stages: JSON.parse(JSON.stringify(state.stages))
    },
    scenarios,
    endpoints: Array.from(distinctMap.values())
  };
}

function syncJsonFromVisualForm() {
  const scriptObj = buildScriptJsonFromState();
  const editor = document.getElementById('json-editor-textarea');
  if (editor) {
    editor.value = JSON.stringify(scriptObj, null, 2);
  }
  validateCurrentEditorJson();
}

function onJsonEditorInput() {
  state.isJsonValid = false;
  const startBtn = document.getElementById('btn-start-test');
  if (startBtn) startBtn.disabled = true;

  const banner = document.getElementById('validation-banner');
  if (banner) {
    banner.className = 'rounded-2xl p-4 border bg-amber-950/30 border-amber-500/40 text-xs text-amber-300';
    banner.innerHTML = `⚠️ <strong>JSON modified manually:</strong> Click <strong>"✓ Validate JSON Now"</strong> to verify the configuration before launching the test.`;
  }
}

async function validateCurrentEditorJson() {
  const editor = document.getElementById('json-editor-textarea');
  const banner = document.getElementById('validation-banner');
  const visualSummary = document.getElementById('script-visual-summary');
  const startBtn = document.getElementById('btn-start-test');
  const launchHint = document.getElementById('launch-hint');

  if (!editor) return false;

  let parsed;
  try {
    parsed = JSON.parse(editor.value);
  } catch (err) {
    state.isJsonValid = false;
    if (startBtn) startBtn.disabled = true;
    if (banner) {
      banner.className = 'rounded-2xl p-4 border bg-rose-950/40 border-rose-500/50 text-xs text-rose-300 space-y-1';
      banner.innerHTML = `
        <div class="font-bold text-sm">❌ JSON Syntax Error</div>
        <div class="font-mono">${escapeHtml(err.message)}</div>
      `;
    }
    if (visualSummary) {
      visualSummary.innerHTML = `<div class="text-rose-400">Fix the JSON syntax error to preview the execution summary.</div>`;
    }
    return false;
  }

  try {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });
    const validation = await res.json();

    if (validation.valid) {
      state.isJsonValid = true;
      state.lastValidatedScript = parsed;
      if (startBtn) startBtn.disabled = false;
      if (launchHint) {
        launchHint.textContent = '✅ test-performance-script validated and ready to execute.';
        launchHint.className = 'text-xs text-emerald-400 font-medium';
      }

      if (banner) {
        banner.className = 'rounded-2xl p-4 border bg-emerald-950/30 border-emerald-500/40 text-xs text-emerald-300 space-y-1.5';
        banner.innerHTML = `
          <div class="font-bold text-sm flex items-center justify-between">
            <span>✅ Validated test-performance-script</span>
            <span class="font-mono text-xs">${validation.summary?.enabledScenariosCount || 1} Scenario(s) · ${validation.summary?.totalStepsCount || 0} Step(s) · Peak ${validation.summary?.totalPeakVUs || 0} VUs</span>
          </div>
          <p class="text-slate-300">All stages, scenarios, sequential steps, confirmed ID arrays, timeouts, and SOAP assertions passed validation.</p>
          ${
            validation.warnings && validation.warnings.length > 0
              ? `<div class="pt-2 border-t border-emerald-800/40 text-amber-300">
                  <strong>Warnings:</strong>
                  <ul class="list-disc pl-4 mt-1 space-y-0.5">${validation.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                 </div>`
              : ''
          }
        `;
      }

      renderScriptVisualSummary(parsed, validation.summary);
      return true;
    } else {
      state.isJsonValid = false;
      if (startBtn) startBtn.disabled = true;
      if (launchHint) {
        launchHint.textContent = '❌ Fix validation errors before launching k6.';
        launchHint.className = 'text-xs text-rose-400 font-medium';
      }

      if (banner) {
        banner.className = 'rounded-2xl p-4 border bg-rose-950/40 border-rose-500/50 text-xs text-rose-300 space-y-2';
        banner.innerHTML = `
          <div class="font-bold text-sm">❌ Validation Failed (${validation.errors?.length || 0} error(s))</div>
          <ul class="list-disc pl-4 space-y-1 font-mono text-[11px]">
            ${(validation.errors || []).map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
        `;
      }
      renderScriptVisualSummary(parsed, validation.summary);
      return false;
    }
  } catch (err) {
    showToast(`Validation request failed: ${err.message}`, 'error');
    return false;
  }
}

function renderScriptVisualSummary(scriptObj, summary) {
  const container = document.getElementById('script-visual-summary');
  if (!container || !scriptObj) return;

  const gc = scriptObj.globalConfig || {};
  const stages = gc.stages || [];
  const enabledScenarios = Array.isArray(scriptObj.scenarios)
    ? scriptObj.scenarios.filter((sc) => sc && sc.enabled !== false)
    : [];

  const stagesBadges = stages
    .map(
      (st, i) =>
        `<span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-sky-300">S${i + 1}: ${escapeHtml(st.duration)}</span>`
    )
    .join(' → ');

  const scenariosCards = enabledScenarios
    .map((sc, idx) => {
      const stepsBadges = (sc.steps || [])
        .map((st, sIdx) => {
          const idKey = ['locationIds', 'kioskIds', 'userGuids', 'customIds'].find((k) => Array.isArray(st.data?.[k]));
          const idsCount = idKey ? st.data[idKey].length : 0;
          return `
            <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">Step ${sIdx + 1}</span>
                <span class="font-mono font-bold text-sky-300 text-xs">${escapeHtml(st.name || st.endpointId || st.id)}</span>
              </div>
              <div class="flex items-center gap-1.5 text-[10px] font-mono">
                <span class="text-emerald-300">${idsCount} IDs</span>
                <span class="text-slate-500">·</span>
                <span class="text-amber-300">SLA p95 &lt; ${st.thresholds?.p95MaxDurationMs ?? 5000}ms</span>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="font-bold text-white text-xs">🎬 ${escapeHtml(sc.name || `Scenario ${idx + 1}`)}</span>
            <span class="text-[11px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono">
              VUs: [${(sc.usersPerStage || []).join(', ')}]
            </span>
          </div>
          <div class="space-y-1.5">
            ${stepsBadges}
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
      <div class="flex justify-between">
        <span class="text-slate-400">Test Name:</span>
        <span class="font-semibold text-white">${escapeHtml(gc.testName || 'N/A')}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Environment & Base URL:</span>
        <span class="font-mono text-sky-300">${escapeHtml(gc.environment || 'QA1')} · ${escapeHtml(gc.baseUrl || '')}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-400">Total Planned Duration:</span>
        <span class="font-mono text-emerald-400 font-bold">${formatTotalDurationSeconds(summary?.totalDurationSeconds || 0)}</span>
      </div>
      <div class="pt-1.5 border-t border-slate-800/80">
        <div class="text-slate-400 mb-1">Global Stages (${stages.length}):</div>
        <div class="flex flex-wrap items-center gap-1">${stagesBadges}</div>
      </div>
    </div>

    <div class="space-y-2.5">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Active Scenarios (${enabledScenarios.length})
      </div>
      ${scenariosCards}
    </div>
  `;
}

function exportScriptJson() {
  const editor = document.getElementById('json-editor-textarea');
  if (!editor) return;
  const blob = new Blob([editor.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `test-performance-script-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported test-performance-script.json', 'info');
}

function importScriptJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const editor = document.getElementById('json-editor-textarea');
    if (editor) {
      editor.value = e.target.result;
      await validateCurrentEditorJson();
      showToast(`Imported ${file.name}`, 'info');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================================
// VIEW 3: LIVE EXECUTION & REAL-TIME CHARTS (SSE)
// ============================================================================
function initCharts() {
  const ctxReqNow = document.getElementById('chart-requests-now')?.getContext('2d');
  if (ctxReqNow) {
    state.charts.requestsNow = new Chart(ctxReqNow, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total Requests Now (req/s)',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.16)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.25
          },
          {
            label: 'callPMSNewMessages (req/s)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.25
          },
          {
            label: 'callKioskPing (req/s)',
            data: [],
            borderColor: '#fbbf24',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: '#1e293b' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  const ctxTp = document.getElementById('chart-throughput')?.getContext('2d');
  if (ctxTp) {
    state.charts.throughput = new Chart(ctxTp, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Requests / sec (RPS)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Active VUs',
            data: [],
            borderColor: '#818cf8',
            backgroundColor: 'rgba(129, 140, 248, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: '#1e293b' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  const ctxLat = document.getElementById('chart-latency')?.getContext('2d');
  if (ctxLat) {
    state.charts.latency = new Chart(ctxLat, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'p50 Median (ms)',
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            tension: 0.3
          },
          {
            label: 'p90 (ms)',
            data: [],
            borderColor: '#818cf8',
            backgroundColor: 'transparent',
            tension: 0.3
          },
          {
            label: 'p95 (ms)',
            data: [],
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'p99 (ms)',
            data: [],
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.08)',
            fill: false,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: '#1e293b' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });
  }
}

function resetLiveViewForNewRun(runId, totalPlannedDurationSec) {
  const banner = document.getElementById('live-reports-ready-banner');
  if (banner) banner.classList.add('hidden');

  const consoleEl = document.getElementById('live-console-output');
  if (consoleEl) consoleEl.textContent = '';

  document.getElementById('live-kpi-vus').textContent = '0';
  document.getElementById('live-kpi-reqs').textContent = '0';
  document.getElementById('live-kpi-rps').textContent = '0 req/s';
  document.getElementById('live-kpi-errors').textContent = '0';
  document.getElementById('run-elapsed-display').textContent = `0s / ${totalPlannedDurationSec || 0}s`;

  const reqNowBadge = document.getElementById('live-requests-now-badge');
  if (reqNowBadge) reqNowBadge.textContent = '0 req/s right now';

  if (state.charts.requestsNow) {
    state.charts.requestsNow.data.labels = [];
    state.charts.requestsNow.data.datasets.forEach((ds) => {
      ds.data = [];
    });
    state.charts.requestsNow.update();
  }
  if (state.charts.throughput) {
    state.charts.throughput.data.labels = [];
    state.charts.throughput.data.datasets[0].data = [];
    state.charts.throughput.data.datasets[1].data = [];
    state.charts.throughput.update();
  }
  if (state.charts.latency) {
    state.charts.latency.data.labels = [];
    state.charts.latency.data.datasets.forEach((ds) => {
      ds.data = [];
    });
    state.charts.latency.update();
  }

  updateLiveHeaderState('running', runId);
}

function updateLiveHeaderState(status, runId) {
  const badge = document.getElementById('run-status-badge');
  const title = document.getElementById('run-title-display');
  const subtitle = document.getElementById('run-subtitle-display');
  const stopBtn = document.getElementById('btn-stop-test');
  const liveDot = document.getElementById('live-indicator');

  if (status === 'running') {
    if (badge) {
      badge.textContent = 'RUNNING';
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/40 animate-pulse';
    }
    if (title) title.textContent = runId || 'Active Execution';
    if (subtitle) subtitle.textContent = 'Receiving real-time telemetry from k6 scenarios...';
    if (stopBtn) stopBtn.disabled = false;
    if (liveDot) liveDot.classList.remove('hidden');
  } else if (status === 'completed') {
    if (badge) {
      badge.textContent = 'COMPLETED';
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    }
    if (title) title.textContent = `${runId || 'Run'} — Finished`;
    if (subtitle) subtitle.textContent = 'HTML reports (General & Per-Endpoint with p50, p90, p95, p99) are ready below.';
    if (stopBtn) stopBtn.disabled = true;
    if (liveDot) liveDot.classList.add('hidden');
  } else if (status === 'stopped' || status === 'failed') {
    if (badge) {
      badge.textContent = status.toUpperCase();
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40';
    }
    if (title) title.textContent = `${runId || 'Run'} — ${status.toUpperCase()}`;
    if (stopBtn) stopBtn.disabled = true;
    if (liveDot) liveDot.classList.add('hidden');
  } else {
    if (badge) {
      badge.textContent = 'IDLE';
      badge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300';
    }
    if (stopBtn) stopBtn.disabled = true;
    if (liveDot) liveDot.classList.add('hidden');
  }
}

async function startPerformanceTest() {
  const valid = await validateCurrentEditorJson();
  if (!valid || !state.lastValidatedScript) {
    showToast('Please fix validation errors before starting the test.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.lastValidatedScript)
    });
    const data = await res.json();

    if (!res.ok || !data.started) {
      const errMsg = data.errors ? data.errors.join(', ') : 'Could not start test';
      showToast(errMsg, 'error');
      return;
    }

    state.totalPlannedSec = data.totalPlannedDurationSec || 0;
    resetLiveViewForNewRun(data.runId, state.totalPlannedSec);
    switchTab('live');
    showToast(`Started performance test: ${data.runId}`, 'info');
  } catch (err) {
    showToast(`Error starting test: ${err.message}`, 'error');
  }
}

async function stopPerformanceTest() {
  try {
    await fetch('/api/run/stop', { method: 'POST' });
    showToast('Sent stop signal (SIGINT) to k6 process.', 'info');
  } catch (err) {
    showToast(`Failed to stop test: ${err.message}`, 'error');
  }
}

function connectSSEStream() {
  if (state.sseSource) {
    state.sseSource.close();
  }

  const es = new EventSource('/api/run/stream');
  state.sseSource = es;

  es.addEventListener('init', (e) => {
    const snap = JSON.parse(e.data);
    state.totalPlannedSec = snap.totalPlannedDurationSec || 0;
    updateLiveHeaderState(snap.status, snap.runId);

    if (Array.isArray(snap.logs) && snap.logs.length > 0) {
      const consoleEl = document.getElementById('live-console-output');
      if (consoleEl) {
        consoleEl.textContent = snap.logs.map((l) => l.text).join('\n') + '\n';
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
    }

    if (Array.isArray(snap.metricsHistory)) {
      snap.metricsHistory.forEach((pt) => pushLiveMetricPoint(pt, false));
      state.charts.requestsNow?.update();
      state.charts.throughput?.update();
      state.charts.latency?.update();
    }

    if (snap.totals) {
      renderLiveTotalsAndTable(snap.totals, snap.metricsHistory?.[snap.metricsHistory.length - 1]);
    }

    if (snap.reports && snap.status === 'completed') {
      renderCompletedReportLinks(snap.reports);
    }
  });

  es.addEventListener('log', (e) => {
    const entry = JSON.parse(e.data);
    const consoleEl = document.getElementById('live-console-output');
    if (consoleEl) {
      if (consoleEl.textContent === 'Waiting for k6 execution...') {
        consoleEl.textContent = '';
      }
      consoleEl.textContent += `${entry.text}\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  });

  es.addEventListener('metric', (e) => {
    const { point, totals } = JSON.parse(e.data);
    if (point) {
      pushLiveMetricPoint(point, true);
      const elapsedEl = document.getElementById('run-elapsed-display');
      if (elapsedEl) {
        elapsedEl.textContent = `${point.elapsedSec}s / ${state.totalPlannedSec || 0}s`;
      }
    }
    if (totals) {
      renderLiveTotalsAndTable(totals, point);
    }
  });

  es.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    updateLiveHeaderState(data.status, data.runId);
    if (data.totals) {
      renderLiveTotalsAndTable(data.totals, null);
    }
    if (data.reports) {
      renderCompletedReportLinks(data.reports);
    }
    loadReportsHistory();
    showToast(`Test run ${data.runId} finished (${data.status}).`, 'info');
  });
}

function pushLiveMetricPoint(pt, shouldUpdateChart = true) {
  const maxPoints = 90;
  const currentReqNow = pt.requestsNow ?? pt.rps ?? 0;

  const reqNowBadge = document.getElementById('live-requests-now-badge');
  if (reqNowBadge) {
    reqNowBadge.textContent = `${currentReqNow} req/s right now`;
  }

  if (state.charts.requestsNow) {
    const cNow = state.charts.requestsNow;
    const pmsNow = pt.byEndpoint?.callPMSNewMessages?.requestsNow ?? 0;
    const kioskNow = pt.byEndpoint?.callKioskPing?.requestsNow ?? 0;

    cNow.data.labels.push(pt.label);
    cNow.data.datasets[0].data.push(currentReqNow);
    cNow.data.datasets[1].data.push(pmsNow);
    cNow.data.datasets[2].data.push(kioskNow);

    if (cNow.data.labels.length > maxPoints) {
      cNow.data.labels.shift();
      cNow.data.datasets.forEach((ds) => ds.data.shift());
    }
    if (shouldUpdateChart) cNow.update();
  }

  if (state.charts.throughput) {
    const c1 = state.charts.throughput;
    c1.data.labels.push(pt.label);
    c1.data.datasets[0].data.push(pt.rps ?? 0);
    c1.data.datasets[1].data.push(pt.activeVUs ?? 0);
    if (c1.data.labels.length > maxPoints) {
      c1.data.labels.shift();
      c1.data.datasets[0].data.shift();
      c1.data.datasets[1].data.shift();
    }
    if (shouldUpdateChart) c1.update();
  }

  if (state.charts.latency) {
    const c2 = state.charts.latency;
    c2.data.labels.push(pt.label);
    c2.data.datasets[0].data.push(pt.p50Ms ?? 0);
    c2.data.datasets[1].data.push(pt.p90Ms ?? 0);
    c2.data.datasets[2].data.push(pt.p95Ms ?? 0);
    c2.data.datasets[3].data.push(pt.p99Ms ?? 0);
    if (c2.data.labels.length > maxPoints) {
      c2.data.labels.shift();
      c2.data.datasets.forEach((ds) => ds.data.shift());
    }
    if (shouldUpdateChart) c2.update();
  }
}

function renderLiveTotalsAndTable(totals, latestPoint) {
  document.getElementById('live-kpi-vus').textContent = String(totals.activeVUs ?? 0);
  document.getElementById('live-kpi-reqs').textContent = String(totals.requests ?? 0);
  if (latestPoint) {
    document.getElementById('live-kpi-rps').textContent = `${latestPoint.requestsNow ?? latestPoint.rps ?? 0} req/s`;
  }
  const errEl = document.getElementById('live-kpi-errors');
  if (errEl) {
    errEl.textContent = String(totals.errors ?? 0);
    errEl.className =
      (totals.errors || 0) > 0
        ? 'text-2xl font-bold text-rose-400 mt-1 font-mono'
        : 'text-2xl font-bold text-emerald-400 mt-1 font-mono';
  }

  const tbody = document.getElementById('live-endpoints-tbody');
  const endpointsMap = totals.byEndpoint || {};
  const entries = Object.values(endpointsMap);

  if (tbody && entries.length > 0) {
    tbody.innerHTML = entries
      .map(
        (ep) => `
        <tr class="hover:bg-slate-800/40">
          <td class="py-2.5 px-3 font-bold text-sky-300">${escapeHtml(ep.name || ep.id)}</td>
          <td class="py-2.5 px-3 text-white font-semibold">${ep.requests ?? 0}</td>
          <td class="py-2.5 px-3 ${(ep.errors || 0) > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}">${ep.errors ?? 0}</td>
          <td class="py-2.5 px-3 text-indigo-300">${ep.maxVUs ?? 0}</td>
          <td class="py-2.5 px-3 text-sky-300">${ep.p50DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-indigo-300">${ep.p90DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-amber-300 font-bold">${ep.p95DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-rose-400 font-bold">${ep.p99DurationMs ?? 0} ms</td>
          <td class="py-2.5 px-3 text-slate-300">${ep.avgDurationMs ?? 0} ms</td>
        </tr>
      `
      )
      .join('');
  }
}

function renderCompletedReportLinks(reports) {
  const banner = document.getElementById('live-reports-ready-banner');
  const linksContainer = document.getElementById('live-reports-links');
  if (!banner || !linksContainer || !reports) return;

  banner.classList.remove('hidden');

  const epButtons = (reports.endpoints || [])
    .map(
      (ep) => `
      <a href="${ep.url}" target="_blank"
        class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/30 text-xs font-semibold transition flex items-center gap-1.5">
        <span>🔌 Report: ${escapeHtml(ep.name)}</span>
      </a>
    `
    )
    .join('');

  linksContainer.innerHTML = `
    <a href="${reports.generalHtml}" target="_blank"
      class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition flex items-center gap-1.5">
      <span>📊 Open General Report (p50, p90, p95, p99)</span>
    </a>
    ${epButtons}
    <a href="${reports.scriptJson}" target="_blank"
      class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono transition">
      { } Executed test-performance-script.json
    </a>
  `;
}

function clearLiveConsole() {
  const consoleEl = document.getElementById('live-console-output');
  if (consoleEl) consoleEl.textContent = '';
}

// ============================================================================
// VIEW 4: REPORTS HISTORY
// ============================================================================
async function loadReportsHistory() {
  const container = document.getElementById('reports-history-container');
  if (!container) return;

  try {
    const res = await fetch('/api/reports');
    const data = await res.json();
    const runs = data.runs || [];

    if (runs.length === 0) {
      container.innerHTML = `
        <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
          No historical test runs found in <code class="text-sky-400">reports/</code> yet. Configure and launch your first test!
        </div>
      `;
      return;
    }

    container.innerHTML = runs
      .map((run) => {
        const stagesText = (run.stages || []).map((s) => `${s.duration}`).join(' → ');
        const epLinksHtml = (run.endpointReports || [])
          .filter((ep) => ep.exists)
          .map(
            (ep) => `
            <a href="${ep.url}" target="_blank"
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-semibold transition">
              🔌 ${escapeHtml(ep.name)} <span class="text-slate-400 font-mono">[${(ep.usersPerStage || []).join(',')}]</span>
            </a>
          `
          )
          .join('');

        return `
          <div class="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-base font-bold text-white font-mono">📁 ${escapeHtml(run.runId)}</span>
                <span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-semibold">
                  ${escapeHtml(run.environment)}
                </span>
                <span class="text-xs text-slate-300 font-semibold">${escapeHtml(run.testName)}</span>
              </div>
              <div class="text-xs text-slate-400 font-mono">
                Base URL: ${escapeHtml(run.baseUrl)} · Stages: [${escapeHtml(stagesText || 'N/A')}]
              </div>
              ${
                run.summaryStats
                  ? `<div class="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                      <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                        Reqs: <strong class="text-white">${run.summaryStats.totalRequests ?? 'N/A'}</strong>
                      </span>
                      <span class="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-500/30 text-sky-300">
                        p50: <strong>${run.summaryStats.p50 ?? 'N/A'} ms</strong>
                      </span>
                      <span class="px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/30 text-indigo-300">
                        p90: <strong>${run.summaryStats.p90 ?? 'N/A'} ms</strong>
                      </span>
                      <span class="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-amber-300">
                        p95: <strong>${run.summaryStats.p95 ?? 'N/A'} ms</strong>
                      </span>
                      <span class="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30 text-rose-300">
                        p99: <strong>${run.summaryStats.p99 ?? 'N/A'} ms</strong>
                      </span>
                    </div>`
                  : ''
              }
            </div>

            <div class="flex flex-wrap items-center gap-2">
              ${
                run.hasGeneralReport
                  ? `<a href="${run.generalReportUrl}" target="_blank"
                      class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition">
                      📊 General Report
                    </a>`
                  : ''
              }
              ${epLinksHtml}
              <a href="${run.scriptJsonUrl}" target="_blank"
                class="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono transition"
                title="View test-performance-script.json used in this run">
                { } Script JSON
              </a>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    container.innerHTML = `<div class="text-rose-400 text-xs">Error loading reports history: ${escapeHtml(err.message)}</div>`;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
  const existing = document.getElementById('toast-notification');
  if (existing) existing.remove();

  const styleClass =
    type === 'error'
      ? 'bg-rose-950 border-rose-500 text-rose-200'
      : 'bg-slate-900 border-sky-500 text-sky-200';

  const el = document.createElement('div');
  el.id = 'toast-notification';
  el.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-2xl text-xs font-semibold ${styleClass}`;
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 3500);
}
