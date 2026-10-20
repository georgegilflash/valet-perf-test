/**
 * Scenarios and Steps View Module (Drag & Drop, Config Drawer, Layouts & Recent Runs)
 */

import {
  state,
  LAYOUTS_STORAGE_KEY,
  LAST_RUNS_STORAGE_KEY,
  escapeHtml,
  showToast
} from './state.js';
import { applyScriptJsonToVisualState, buildScriptJsonFromState, validateCurrentEditorJson } from './script.view.js';

export function createStepInstanceFromTemplate(epId, openDrawer = true) {
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

export async function loadCatalogAndPools() {
  try {
    const res = await fetch('/api/catalog');
    const data = await res.json();
    state.catalog = data.catalog || [];
    state.pools = data.pools || { locationIds: [], locationIdsQa3: [], kioskIds: [], userGuids: [], tokens: [] };

    state.catalog.forEach((tpl) => {
      const primaryPool = tpl.dataRequirements?.primaryIdPool;
      const poolKey = primaryPool?.key || 'locationIds';
      const fullPoolList = state.pools[poolKey] || [];
      // Load the complete pool so all available IDs are ready immediately
      const defaultConfirmedIds = [...fullPoolList];

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
        thinkTimeRange: tpl.defaultThinkTimeRange
          ? JSON.parse(JSON.stringify(tpl.defaultThinkTimeRange))
          : { enabled: true, min: tpl.defaultThinkTimeSec ?? 1.0, max: (tpl.defaultThinkTimeSec ?? 1.0) + 2.0 },
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
          },
          ...(tpl.dataRequirements?.customParams || {})
        },
        thresholds: {
          p50MaxDurationMs: tpl.defaultThresholds?.p50MaxDurationMs ?? 500,
          p90MaxDurationMs: tpl.defaultThresholds?.p90MaxDurationMs ?? 1000,
          p95MaxDurationMs: tpl.defaultThresholds?.p95MaxDurationMs ?? 2500,
          p99MaxDurationMs: tpl.defaultThresholds?.p99MaxDurationMs ?? 5000,
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

    // Initialize with a single clean empty scenario by default
    if (state.scenarios.length === 0) {
      state.scenarios.push({
        id: 'scenario_1',
        name: 'Scenario 1: Custom Flow',
        enabled: true,
        usersPerStage: state.stages.map(() => 5),
        steps: []
      });
      state.activeScenarioId = 'scenario_1';
    }
    if (!state.activeScenarioId && state.scenarios.length > 0) {
      state.activeScenarioId = state.scenarios[0].id;
    }
  } catch (err) {
    console.error('Error loading catalog and pools:', err);
    showToast('Failed to load endpoint catalog from server.', 'error');
  }
}

export function renderCatalogSelector() {
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
                ${
                  ep.description
                    ? `
                  <div class="relative group/tip inline-flex items-center">
                    <span class="w-4 h-4 rounded-full bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 flex items-center justify-center text-[10px] font-bold font-serif cursor-help transition border border-slate-700"
                      title="${escapeHtml(ep.description)}">
                      i
                    </span>
                    <div class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/tip:block w-56 p-2 rounded-lg bg-slate-900 border border-slate-700 shadow-xl text-[11px] text-slate-300 font-normal leading-relaxed z-30">
                      ${escapeHtml(ep.description)}
                    </div>
                  </div>`
                    : ''
                }
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

export function quickAddStepToSelectedScenario(epId) {
  if (state.scenarios.length === 0) {
    addNewScenario(epId);
    return;
  }
  const selectEl = document.getElementById(`quick-add-target-${epId}`);
  const targetScId = selectEl?.value || state.activeScenarioId || state.scenarios[0].id;
  addStepToScenario(targetScId, epId);
}

export function selectActiveScenario(scenarioId) {
  state.activeScenarioId = scenarioId;
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
}

export function addNewScenario(initialEndpointId = null) {
  const nextNum = state.scenarios.length + 1;
  const firstStep = initialEndpointId ? createStepInstanceFromTemplate(initialEndpointId, true) : null;

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

export function removeScenario(scenarioId) {
  state.scenarios = state.scenarios.filter((sc) => sc.id !== scenarioId);
  if (state.activeScenarioId === scenarioId) {
    state.activeScenarioId = state.scenarios[0]?.id || null;
  }
  renderCatalogSelector();
  renderSelectedEndpointsConfig();
}

export function toggleScenarioEnabled(scenarioId, checked) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.enabled = Boolean(checked);
  renderSelectedEndpointsConfig();
}

export function updateScenarioName(scenarioId, newName) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.name = newName;
  renderCatalogSelector();
}

export function updateScenarioStageVU(scenarioId, stageIdx, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.usersPerStage[stageIdx] = Math.max(0, parseInt(val, 10) || 0);
  const peakEl = document.getElementById(`peak-vu-${scenarioId}`);
  if (peakEl) {
    peakEl.textContent = String(Math.max(...sc.usersPerStage, 0));
  }
}

export function addStepToScenario(scenarioId, endpointId, insertIndex = null) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  const newStep = createStepInstanceFromTemplate(endpointId, false);
  if (!newStep) return;

  if (insertIndex !== null && insertIndex >= 0 && insertIndex <= sc.steps.length) {
    sc.steps.splice(insertIndex, 0, newStep);
  } else {
    sc.steps.push(newStep);
  }

  // Automatic pairing for Ticket issuance: when adding IssueTicket2, pair with GetTicket and CompleteTicket1 steps
  if (endpointId === 'callKioskIssueTicket2') {
    newStep.thinkTimeSec = 5.0; // Wait 5 seconds after issuing before checking with GetTicket
    const getTicketStep = createStepInstanceFromTemplate('callKioskGetTicket', false);
    const completeTicketStep = createStepInstanceFromTemplate('callKioskCompleteTicket1', false);
    if (getTicketStep) {
      getTicketStep.thinkTimeSec = 5.0; // Wait 5 seconds after get ticket before completing
    }

    let insertPos = insertIndex !== null && insertIndex >= 0 ? insertIndex + 1 : sc.steps.length;
    if (getTicketStep) {
      sc.steps.splice(insertPos++, 0, getTicketStep);
    }
    if (completeTicketStep) {
      sc.steps.splice(insertPos++, 0, completeTicketStep);
    }

    renderSelectedEndpointsConfig();
    showToast(`Added IssueTicket2 and automatically paired with GetTicket & CompleteTicket1`, 'info');
    return;
  }

  renderSelectedEndpointsConfig();
  showToast(`Added step "${newStep.name}" to ${sc.name}`, 'info');
}

export function removeStepFromScenario(scenarioId, stepIndex) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  sc.steps.splice(stepIndex, 1);
  renderSelectedEndpointsConfig();
}

export function moveStepInScenario(scenarioId, stepIndex, direction) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc) return;
  const targetIdx = stepIndex + direction;
  if (targetIdx < 0 || targetIdx >= sc.steps.length) return;
  const [moved] = sc.steps.splice(stepIndex, 1);
  sc.steps.splice(targetIdx, 0, moved);
  renderSelectedEndpointsConfig();
}

export function toggleStepConfigDrawer(scenarioId, stepIndex) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIndex]) return;
  sc.steps[stepIndex].drawerOpen = !sc.steps[stepIndex].drawerOpen;
  renderSelectedEndpointsConfig();
}

export function onCatalogDragStart(event, endpointId) {
  state.dragPayload = {
    type: 'catalog',
    endpointId
  };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', JSON.stringify(state.dragPayload));
  }
}

export function onStepDragStart(event, sourceScenarioId, sourceStepIndex) {
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

export function onScenarioDragOver(event, scenarioId) {
  event.preventDefault();
  const dropZone = document.getElementById(`scenario-dropzone-${scenarioId}`);
  if (dropZone) {
    dropZone.classList.add('border-sky-400', 'bg-sky-950/30');
  }
}

export function onScenarioDragLeave(event, scenarioId) {
  const dropZone = document.getElementById(`scenario-dropzone-${scenarioId}`);
  if (dropZone) {
    dropZone.classList.remove('border-sky-400', 'bg-sky-950/30');
  }
}

export function onScenarioDrop(event, targetScenarioId, targetStepIndex = null) {
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

export function renderSelectedEndpointsConfig() {
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

  if (!state.activeScenarioId || !state.scenarios.some((s) => s.id === state.activeScenarioId)) {
    state.activeScenarioId = state.scenarios[0].id;
  }

  const activeSc = state.scenarios.find((s) => s.id === state.activeScenarioId) || state.scenarios[0];
  const scIdx = state.scenarios.findIndex((s) => s.id === activeSc.id);

  const scenarioTabsHtml = `
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1.5">
          <span>Select Scenario:</span>
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
                      ${currentIds.length} / ${defaultPoolList.length} IDs (${escapeHtml(step.data?.selectionMode || 'random')})
                    </span>
                    <span class="px-2 py-0.5 rounded bg-slate-800/80 text-emerald-400 border border-slate-700/60 text-[11px] font-mono" title="Think time">
                      ⏱ ${
                        step.thinkTimeRange?.enabled
                          ? `${step.thinkTimeRange.min ?? 1}-${step.thinkTimeRange.max ?? 3}s (rand)`
                          : `${step.thinkTimeSec ?? 1}s`
                      }
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
                  <!-- Timeout, Think Time & SLA Thresholds -->
                  <div class="space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                        <label class="block text-[10px] text-slate-400 font-medium mb-1">Step Timeout (e.g. 60s)</label>
                        <input type="text" value="${escapeHtml(step.timeout)}"
                          oninput="updateStepField('${sc.id}', ${stepIdx}, 'timeout', this.value)"
                          class="w-full bg-transparent text-xs font-mono text-white focus:outline-none" />
                      </div>
                      <div class="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                        <div class="flex items-center justify-between mb-1">
                          <label class="block text-[10px] text-slate-400 font-medium">Think Time</label>
                          <label class="flex items-center gap-1 cursor-pointer select-none" title="Toggle between fixed think time and randomizer range">
                            <input type="checkbox" ${step.thinkTimeRange?.enabled ? 'checked' : ''}
                              onchange="toggleStepThinkTimeRandomizer('${sc.id}', ${stepIdx}, this.checked)"
                              class="rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-0 text-[10px] scale-90 cursor-pointer" />
                            <span class="text-[9px] font-semibold ${step.thinkTimeRange?.enabled ? 'text-sky-300 font-bold' : 'text-slate-400'}">Random Range</span>
                          </label>
                        </div>
                        ${
                          step.thinkTimeRange?.enabled
                            ? `
                          <div class="flex items-center gap-2">
                            <div class="flex-1 min-w-0">
                              <span class="block text-[8px] text-slate-400 font-mono">MIN (s)</span>
                              <input type="number" step="0.1" min="0" value="${step.thinkTimeRange?.min ?? step.thinkTimeSec ?? 1.0}"
                                oninput="updateStepThinkMinMax('${sc.id}', ${stepIdx}, 'min', this.value)"
                                placeholder="Min"
                                title="Minimum think time in seconds"
                                class="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-sky-500 text-center" />
                            </div>
                            <span class="text-slate-500 text-xs font-mono pt-3">-</span>
                            <div class="flex-1 min-w-0">
                              <span class="block text-[8px] text-slate-400 font-mono">MAX (s)</span>
                              <input type="number" step="0.1" min="0" value="${step.thinkTimeRange?.max ?? (step.thinkTimeSec ?? 1.0) + 2.0}"
                                oninput="updateStepThinkMinMax('${sc.id}', ${stepIdx}, 'max', this.value)"
                                placeholder="Max"
                                title="Maximum think time in seconds"
                                class="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-sky-500 text-center" />
                            </div>
                          </div>
                        `
                            : `
                          <div>
                            <span class="block text-[8px] text-slate-400 font-mono">FIXED (s)</span>
                            <input type="number" step="0.1" min="0" value="${step.thinkTimeSec ?? 1.0}"
                              oninput="updateStepFixedThinkTime('${sc.id}', ${stepIdx}, this.value)"
                              placeholder="1.0"
                              title="Fixed think time in seconds"
                              class="w-full bg-transparent text-xs font-mono text-emerald-300 focus:outline-none" />
                          </div>
                        `
                        }
                      </div>
                    </div>

                    <!-- Thresholds SLA (p50, p90, p95, p99) con fila independiente y amplio padding -->
                    <div class="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 space-y-2">
                      <div class="flex flex-wrap items-center justify-between gap-1">
                        <label class="block text-[11px] text-slate-300 font-semibold">Response Time Thresholds (ms)</label>
                        <span class="text-[10px] text-slate-400 font-mono">inherits global if empty</span>
                      </div>
                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2">
                          <span class="block text-[9px] text-emerald-400 font-mono font-bold mb-0.5">p50 (ms)</span>
                          <input type="number" step="50" min="0"
                            value="${step.thresholds?.p50MaxDurationMs !== undefined ? step.thresholds.p50MaxDurationMs : ''}"
                            placeholder="(${state.globalThresholds?.p50 ?? 500})"
                            title="Percentil 50 umbral (ms)"
                            oninput="updateStepThreshold('${sc.id}', ${stepIdx}, 'p50MaxDurationMs', this.value === '' ? null : parseInt(this.value, 10))"
                            class="w-full bg-transparent text-xs font-mono text-emerald-300 focus:outline-none" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2">
                          <span class="block text-[9px] text-sky-400 font-mono font-bold mb-0.5">p90 (ms)</span>
                          <input type="number" step="50" min="0"
                            value="${step.thresholds?.p90MaxDurationMs !== undefined ? step.thresholds.p90MaxDurationMs : ''}"
                            placeholder="(${state.globalThresholds?.p90 ?? 1000})"
                            title="Percentil 90 umbral (ms)"
                            oninput="updateStepThreshold('${sc.id}', ${stepIdx}, 'p90MaxDurationMs', this.value === '' ? null : parseInt(this.value, 10))"
                            class="w-full bg-transparent text-xs font-mono text-sky-300 focus:outline-none" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2">
                          <span class="block text-[9px] text-amber-400 font-mono font-bold mb-0.5">p95 (ms)</span>
                          <input type="number" step="50" min="0"
                            value="${step.thresholds?.p95MaxDurationMs !== undefined ? step.thresholds.p95MaxDurationMs : ''}"
                            placeholder="(${state.globalThresholds?.p95 ?? 2500})"
                            title="Percentil 95 umbral (ms)"
                            oninput="updateStepThreshold('${sc.id}', ${stepIdx}, 'p95MaxDurationMs', this.value === '' ? null : parseInt(this.value, 10))"
                            class="w-full bg-transparent text-xs font-mono text-amber-300 focus:outline-none" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2">
                          <span class="block text-[9px] text-rose-400 font-mono font-bold mb-0.5">p99 (ms)</span>
                          <input type="number" step="50" min="0"
                            value="${step.thresholds?.p99MaxDurationMs !== undefined ? step.thresholds.p99MaxDurationMs : ''}"
                            placeholder="(${state.globalThresholds?.p99 ?? 5000})"
                            title="Percentil 99 umbral (ms)"
                            oninput="updateStepThreshold('${sc.id}', ${stepIdx}, 'p99MaxDurationMs', this.value === '' ? null : parseInt(this.value, 10))"
                            class="w-full bg-transparent text-xs font-mono text-rose-300 focus:outline-none" />
                        </div>
                      </div>
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
                          <button onclick="loadDefaultIdsForStep('${sc.id}', ${stepIdx}, '${poolKey}', null)"
                            class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-300 font-bold transition"
                            title="Load all ${defaultPoolList.length} IDs from pool">
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

                  <!-- Endpoint Specific Dynamic Parameters (Dates, Counts, Ranges) -->
                  ${
                    step.endpointId === 'callKioskGetKnownDrivers' || step.id === 'callKioskGetKnownDrivers'
                      ? `
                    <div class="bg-slate-900/80 border border-sky-500/30 rounded-xl p-3 space-y-2.5">
                      <div class="flex items-center justify-between">
                        <h5 class="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                          <span>⚙️ GetKnownDrivers Parameters</span>
                        </h5>
                        <span class="text-[10px] text-slate-400 font-mono">kioskID: selected from pool above</span>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">From Timestamp (&lt;from&gt;)</label>
                          <input type="text" value="${escapeHtml(step.data?.from || step.data?.fromDate || '2026-08-27T00:00:00')}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'from', this.value)"
                            placeholder="YYYY-MM-DDTHH:mm:ss"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Start Index (&lt;start&gt;)</label>
                          <input type="number" min="0" value="${step.data?.start !== undefined ? step.data.start : 0}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'start', parseInt(this.value, 10) || 0)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Count (&lt;count&gt;)</label>
                          <input type="number" min="1" max="1000" value="${step.data?.count !== undefined ? step.data.count : 10}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'count', parseInt(this.value, 10) || 1)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-emerald-300 font-bold focus:outline-none focus:border-sky-500" />
                        </div>
                      </div>
                    </div>`
                      : ''
                  }

                  ${
                    step.endpointId === 'callKioskGetKnownDriverChanges' || step.id === 'callKioskGetKnownDriverChanges'
                      ? `
                    <div class="bg-slate-900/80 border border-amber-500/30 rounded-xl p-3 space-y-2.5">
                      <div class="flex items-center justify-between">
                        <h5 class="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <span>⚙️ GetKnownDriverChanges DatabaseChange Parameters</span>
                        </h5>
                        <span class="text-[10px] text-slate-400 font-mono">kioskID: selected from pool above</span>
                      </div>
                      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Year</label>
                          <input type="number" min="2020" max="2035" value="${step.data?.year !== undefined ? step.data.year : 2026}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'year', parseInt(this.value, 10) || 2026)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Month</label>
                          <input type="number" min="1" max="12" value="${step.data?.month !== undefined ? step.data.month : 8}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'month', parseInt(this.value, 10) || 1)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Day</label>
                          <input type="number" min="1" max="31" value="${step.data?.day !== undefined ? step.data.day : 27}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'day', parseInt(this.value, 10) || 1)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Total</label>
                          <input type="number" min="0" value="${step.data?.total !== undefined ? step.data.total : 0}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'total', parseInt(this.value, 10) || 0)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-emerald-300 font-bold focus:outline-none focus:border-sky-500" />
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Burnt</label>
                          <input type="number" min="0" value="${step.data?.burnt !== undefined ? step.data.burnt : 0}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'burnt', parseInt(this.value, 10) || 0)"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500" />
                        </div>
                      </div>
                    </div>`
                      : ''
                  }

                  ${
                    step.endpointId === 'callKioskIssueTicket2' || step.id === 'callKioskIssueTicket2'
                      ? `
                    <div class="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3 space-y-2.5">
                      <div class="flex items-center justify-between">
                        <h5 class="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <span>IssueTicket2 Settings</span>
                        </h5>
                        <span class="text-[10px] text-slate-400 font-mono">kioskID: selected from pool above</span>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Ticket Number Prefix</label>
                          <input type="text" value="${escapeHtml(step.data?.prefix || 'PERF-')}"
                            oninput="updateStepDataField('${sc.id}', ${stepIdx}, 'prefix', this.value)"
                            placeholder="PERF-"
                            class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-emerald-300 font-bold focus:outline-none focus:border-emerald-500" />
                          <span class="block text-[9px] text-slate-500 mt-1">Generates: <code>${escapeHtml(step.data?.prefix || 'PERF-')}&lt;timestamp_ms&gt;-&lt;1..100&gt;</code></span>
                        </div>
                        <div class="bg-slate-950 border border-slate-800 rounded-lg p-2">
                          <label class="block text-[10px] text-slate-400 mb-1">Ticket ID (GUID Generation)</label>
                          <div class="text-xs font-mono text-slate-300 bg-slate-900 border border-slate-700/60 rounded px-2 py-1">
                            Dynamic GUID (unique per iteration)
                          </div>
                          <span class="block text-[9px] text-slate-500 mt-1">Shared with subsequent steps (e.g. <code>GetTicket</code>)</span>
                        </div>
                      </div>
                    </div>`
                      : ''
                  }

                  ${
                    step.endpointId === 'callKioskGetTicket' || step.id === 'callKioskGetTicket'
                      ? `
                    <div class="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-3 space-y-2.5">
                      <div class="flex items-center justify-between">
                        <h5 class="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                          <span>🔍 GetTicket Lookup Settings</span>
                        </h5>
                        <span class="text-[10px] text-slate-400 font-mono">kioskID: selected from pool above</span>
                      </div>
                      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                        <div class="flex items-center gap-2 text-indigo-300 font-semibold text-[11px]">
                          <span>ℹ️ Iteration Context Binding</span>
                        </div>
                        <p class="text-[11px] text-slate-400 leading-relaxed">
                          When preceded by <code class="text-emerald-300">IssueTicket2</code> in the same scenario, this step automatically verifies the exact <code class="text-sky-300">ticketID</code> generated by that issuance.
                        </p>
                      </div>
                    </div>`
                      : ''
                  }

                  ${
                    step.endpointId === 'callKioskCompleteTicket1' || step.id === 'callKioskCompleteTicket1'
                      ? `
                    <div class="bg-slate-900/80 border border-amber-500/30 rounded-xl p-3 space-y-2.5">
                      <div class="flex items-center justify-between">
                        <h5 class="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <span>✅ CompleteTicket1 Settings</span>
                        </h5>
                        <span class="text-[10px] text-slate-400 font-mono">kioskID: selected from pool above</span>
                      </div>
                      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                        <div class="flex items-center gap-2 text-amber-300 font-semibold text-[11px]">
                          <span>ℹ️ Iteration Context Binding</span>
                        </div>
                        <p class="text-[11px] text-slate-400 leading-relaxed">
                          When preceded by <code class="text-emerald-300">IssueTicket2</code> in the same scenario, this step automatically completes the exact <code class="text-sky-300">ticketID</code> and <code class="text-sky-300">kioskID</code> generated by that issuance.
                        </p>
                      </div>
                    </div>`
                      : ''
                  }
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
          Scenario Target Virtual Users (VUs) per Stage
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

export function toggleStepThinkTimeRandomizer(scenarioId, stepIdx, checked) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const isEnabled = Boolean(checked);
  const curVal = sc.steps[stepIdx].thinkTimeSec ?? 1.0;
  if (!sc.steps[stepIdx].thinkTimeRange) {
    sc.steps[stepIdx].thinkTimeRange = { enabled: isEnabled, min: curVal, max: curVal + 2.0 };
  } else {
    sc.steps[stepIdx].thinkTimeRange.enabled = isEnabled;
  }
  renderSelectedEndpointsConfig();
}

export function updateStepFixedThinkTime(scenarioId, stepIdx, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const num = Math.max(0, parseFloat(val) || 0);
  sc.steps[stepIdx].thinkTimeSec = num;
  if (sc.steps[stepIdx].thinkTimeRange) {
    sc.steps[stepIdx].thinkTimeRange.min = num;
  }
}

export function updateStepThinkMinMax(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const num = Math.max(0, parseFloat(val) || 0);
  if (!sc.steps[stepIdx].thinkTimeRange) {
    const curVal = sc.steps[stepIdx].thinkTimeSec ?? 1.0;
    sc.steps[stepIdx].thinkTimeRange = { enabled: true, min: curVal, max: curVal + 2.0 };
  }
  sc.steps[stepIdx].thinkTimeRange[field] = num;
  if (field === 'min') {
    sc.steps[stepIdx].thinkTimeSec = num;
  }
}

export function updateStepThinkTimeRange(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  if (!sc.steps[stepIdx].thinkTimeRange) {
    const curVal = sc.steps[stepIdx].thinkTimeSec ?? 1.0;
    sc.steps[stepIdx].thinkTimeRange = { enabled: false, min: curVal, max: curVal + 2.0 };
  }
  if (field === 'enabled') {
    sc.steps[stepIdx].thinkTimeRange.enabled = Boolean(val);
    renderSelectedEndpointsConfig();
  } else {
    sc.steps[stepIdx].thinkTimeRange[field] = Math.max(0, parseFloat(val) || 0);
  }
}

export function updateStepField(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  sc.steps[stepIdx][field] = val;
}

export function updateStepDataField(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  if (!sc.steps[stepIdx].data) sc.steps[stepIdx].data = {};
  sc.steps[stepIdx].data[field] = val;
}

export function updateStepThreshold(scenarioId, stepIdx, field, val) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  if (!sc.steps[stepIdx].thresholds) sc.steps[stepIdx].thresholds = {};
  sc.steps[stepIdx].thresholds[field] = val;
}

export function toggleStepAssertion(scenarioId, stepIdx, assertionIdx, checked) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx] || !sc.steps[stepIdx].assertions?.[assertionIdx]) return;
  sc.steps[stepIdx].assertions[assertionIdx].enabled = Boolean(checked);
}

export function updateStepSelectionMode(scenarioId, stepIdx, mode) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  sc.steps[stepIdx].data.selectionMode = mode;
  const primaryPool = sc.steps[stepIdx].dataRequirements?.primaryIdPool || { key: 'locationIds' };
  const count = (sc.steps[stepIdx].data[primaryPool.key] || []).length;
  const total = (state.pools[primaryPool.key] || []).length;
  const badge = document.getElementById(`step-id-badge-${scenarioId}-${stepIdx}`);
  if (badge) badge.textContent = `${count} / ${total} IDs (${mode})`;
}

export function updateStepIdList(scenarioId, stepIdx, poolKey, rawText) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const list = rawText
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  sc.steps[stepIdx].data[poolKey] = list;

  const total = (state.pools[poolKey] || []).length;
  const badge = document.getElementById(`step-id-badge-${scenarioId}-${stepIdx}`);
  if (badge) {
    badge.textContent = `${list.length} / ${total} IDs (${sc.steps[stepIdx].data.selectionMode || 'random'})`;
  }
}

export function loadDefaultIdsForStep(scenarioId, stepIdx, poolKey, count) {
  const sc = state.scenarios.find((s) => s.id === scenarioId);
  if (!sc || !sc.steps[stepIdx]) return;
  const fullPool = state.pools[poolKey] || [];
  const sliced = (count === null || count === undefined || count >= fullPool.length)
    ? [...fullPool]
    : fullPool.slice(0, count);
  sc.steps[stepIdx].data[poolKey] = [...sliced];

  const textarea = document.getElementById(`textarea-step-ids-${scenarioId}-${stepIdx}`);
  if (textarea) {
    textarea.value = sliced.join('\n');
  }
  const badge = document.getElementById(`step-id-badge-${scenarioId}-${stepIdx}`);
  if (badge) {
    badge.textContent = `${sliced.length} / ${fullPool.length} IDs (${sc.steps[stepIdx].data.selectionMode || 'random'})`;
  }
  showToast(`Loaded ${sliced.length} IDs from data/${poolKey}.json`, 'info');
}

export function getSavedLayouts() {
  try {
    const raw = window.localStorage.getItem(LAYOUTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Could not read saved layouts from localStorage:', err);
    return [];
  }
}

export function saveLayoutsList(layouts) {
  try {
    window.localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
  } catch (err) {
    console.warn('Could not save layouts to localStorage:', err);
  }
}

export function saveCurrentLayoutPrompt() {
  const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const layoutName = window.prompt('Enter a name for this Scenario Layout:', defaultName);
  if (!layoutName || !layoutName.trim()) return;

  const trimmed = layoutName.trim();
  const scriptObj = buildScriptJsonFromState();
  const layouts = getSavedLayouts();

  const newLayout = {
    id: `layout_${Date.now()}`,
    name: trimmed,
    savedAt: new Date().toISOString(),
    scenariosCount: state.scenarios.length,
    totalSteps: state.scenarios.reduce((acc, sc) => acc + (sc.steps?.length || 0), 0),
    data: scriptObj
  };

  layouts.unshift(newLayout);
  if (layouts.length > 20) layouts.splice(20);
  saveLayoutsList(layouts);
  showToast(`Layout "${trimmed}" saved successfully.`, 'info');
}

export function loadSavedLayout(layoutId) {
  const layouts = getSavedLayouts();
  const target = layouts.find((l) => l.id === layoutId);
  if (!target || !target.data) {
    showToast('Saved layout not found.', 'error');
    return;
  }
  applyScriptJsonToVisualState(target.data);
  showToast(`Loaded layout "${target.name}".`, 'info');
}

export function deleteSavedLayout(layoutId) {
  let layouts = getSavedLayouts();
  const target = layouts.find((l) => l.id === layoutId);
  if (!target) return;
  if (!window.confirm(`Delete saved layout "${target.name}"?`)) return;

  layouts = layouts.filter((l) => l.id !== layoutId);
  saveLayoutsList(layouts);
  showToast(`Deleted layout "${target.name}".`, 'info');
  openLayoutsManagerModal();
}

export function openLayoutsManagerModal() {
  const existing = document.getElementById('layouts-manager-modal');
  if (existing) existing.remove();

  const layouts = getSavedLayouts();
  const listHtml =
    layouts.length === 0
      ? `<div class="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
          No saved layouts yet. Click <strong>"💾 Save Layout"</strong> to save your current scenario setup.
         </div>`
      : layouts
          .map(
            (l) => `
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-sm font-bold text-white">${escapeHtml(l.name)}</div>
              <div class="text-[11px] text-slate-400 mt-0.5">
                Saved: ${new Date(l.savedAt).toLocaleString()} · <span class="text-sky-300 font-mono">${l.scenariosCount || 0} scenarios, ${l.totalSteps || 0} steps</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="loadSavedLayout('${l.id}'); document.getElementById('layouts-manager-modal').remove();"
                class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition">
                Load
              </button>
              <button onclick="deleteSavedLayout('${l.id}')"
                class="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-300 text-xs font-semibold transition"
                title="Delete saved layout">
                🗑️
              </button>
            </div>
          </div>
        `
          )
          .join('');

  const modal = document.createElement('div');
  modal.id = 'layouts-manager-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
  modal.innerHTML = `
    <div class="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span>💾 Saved Scenario Layouts</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">
            Load or manage your saved scenarios layouts directly in this browser.
          </p>
        </div>
        <button onclick="document.getElementById('layouts-manager-modal').remove()"
          class="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 rounded-lg hover:bg-slate-800 transition">
          ✕
        </button>
      </div>

      <div class="overflow-y-auto space-y-2.5 flex-1 pr-1 custom-scrollbar">
        ${listHtml}
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
        <button onclick="saveCurrentLayoutPrompt(); openLayoutsManagerModal();"
          class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition flex items-center gap-1.5">
          <span>+ Save Current as New Layout</span>
        </button>
        <button onclick="document.getElementById('layouts-manager-modal').remove()"
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
          Close
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function recordRunInLocalStorage(scriptObj, runId) {
  try {
    const raw = window.localStorage.getItem(LAST_RUNS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const entry = {
      runId: runId || `run_${Date.now()}`,
      timestamp: new Date().toISOString(),
      testName: scriptObj.globalConfig?.testName || 'Valet Test',
      environment: scriptObj.globalConfig?.environment || 'QA1',
      scenariosCount: scriptObj.scenarios?.length || 0,
      totalSteps: (scriptObj.scenarios || []).reduce((acc, sc) => acc + (sc.steps?.length || 0), 0),
      scriptObj
    };

    list.unshift(entry);
    if (list.length > 5) list.splice(5);
    window.localStorage.setItem(LAST_RUNS_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not record run in localStorage:', err);
  }
}

export async function openRecentRunsModal() {
  const existing = document.getElementById('recent-runs-modal');
  if (existing) existing.remove();

  let localRuns = [];
  try {
    const raw = window.localStorage.getItem(LAST_RUNS_STORAGE_KEY);
    localRuns = raw ? JSON.parse(raw) : [];
  } catch (err) {
    localRuns = [];
  }

  let serverRuns = [];
  try {
    const res = await fetch('/api/reports');
    const data = await res.json();
    serverRuns = (data.runs || []).slice(0, 5);
  } catch (err) {
    serverRuns = [];
  }

  let contentHtml = '';
  if (localRuns.length === 0 && serverRuns.length === 0) {
    contentHtml = `
      <div class="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
        No recent test runs recorded yet. Run a test to save its configuration here.
      </div>
    `;
  } else {
    if (serverRuns.length > 0) {
      contentHtml = serverRuns
        .map(
          (r, idx) => `
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[11px] font-bold">#${idx + 1}</span>
              <span class="text-sm font-bold text-white font-mono">${escapeHtml(r.runId)}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-slate-900 text-sky-400 border border-slate-800 font-semibold">${escapeHtml(r.environment)}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1">${escapeHtml(r.testName)} · ${escapeHtml(r.timestamp || '')}</div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="loadScenariosFromRecentServerRun('${r.scriptJsonUrl}', '${escapeHtml(r.runId)}')"
              class="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition">
              ↻ Load Scenarios
            </button>
            <a href="${r.scriptJsonUrl}" target="_blank"
              class="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono transition"
              title="View script JSON">
              { }
            </a>
          </div>
        </div>
      `
        )
        .join('');
    } else {
      contentHtml = localRuns
        .map(
          (r, idx) => `
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[11px] font-bold">#${idx + 1}</span>
              <span class="text-sm font-bold text-white font-mono">${escapeHtml(r.runId)}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-slate-900 text-sky-400 border border-slate-800 font-semibold">${escapeHtml(r.environment)}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1">${escapeHtml(r.testName)} · ${r.scenariosCount || 0} scenarios, ${r.totalSteps || 0} steps</div>
          </div>
          <button onclick="applyScriptJsonToVisualState(${escapeHtml(JSON.stringify(r.scriptObj))}); document.getElementById('recent-runs-modal').remove();"
            class="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition">
            ↻ Load Scenarios
          </button>
        </div>
      `
        )
        .join('');
    }
  }

  const modal = document.createElement('div');
  modal.id = 'recent-runs-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
  modal.innerHTML = `
    <div class="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span>⏱️ Last 5 Executions</span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">
            Load the exact scenarios and endpoints configuration from your last 5 test runs.
          </p>
        </div>
        <button onclick="document.getElementById('recent-runs-modal').remove()"
          class="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 rounded-lg hover:bg-slate-800 transition">
          ✕
        </button>
      </div>

      <div class="overflow-y-auto space-y-2.5 flex-1 pr-1 custom-scrollbar">
        ${contentHtml}
      </div>

      <div class="pt-3 border-t border-slate-800 flex items-center justify-end">
        <button onclick="document.getElementById('recent-runs-modal').remove()"
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition">
          Close
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export async function loadScenariosFromRecentServerRun(scriptJsonUrl, runId) {
  try {
    const res = await fetch(scriptJsonUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const scriptObj = await res.json();
    applyScriptJsonToVisualState(scriptObj);
    const modal = document.getElementById('recent-runs-modal');
    if (modal) modal.remove();
    showToast(`Loaded scenarios from run ${runId}`, 'info');
  } catch (err) {
    showToast(`Failed to load script for run ${runId}: ${err.message}`, 'error');
  }
}
