import {
  state,
  DEFAULT_GLOBAL_THRESHOLDS,
  saveStagesToLocalStorage,
  saveThresholdsToLocalStorage,
  loadThresholdsFromLocalStorage,
  escapeHtml,
  showToast
} from './state.js';
import { formatTotalDurationSeconds, onEnvironmentChange, renderStages } from './stages.view.js';

export function buildScriptJsonFromState() {
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
      thinkTimeRange: st.thinkTimeRange ? JSON.parse(JSON.stringify(st.thinkTimeRange)) : null,
      data: JSON.parse(JSON.stringify(st.data)),
      thresholds: JSON.parse(JSON.stringify(st.thresholds)),
      assertions: JSON.parse(JSON.stringify(st.assertions))
    }))
  }));

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
      thresholds: {
        p50MaxDurationMs: state.globalThresholds?.p50 ?? 500,
        p90MaxDurationMs: state.globalThresholds?.p90 ?? 1000,
        p95MaxDurationMs: state.globalThresholds?.p95 ?? 2500,
        p99MaxDurationMs: state.globalThresholds?.p99 ?? 5000,
        maxErrorRate: state.globalThresholds?.maxErrorRate ?? 0.01,
      },
      stages: JSON.parse(JSON.stringify(state.stages))
    },
    scenarios,
    endpoints: Array.from(distinctMap.values())
  };
}

export function renderGlobalThresholdInputs() {
  const p50Input = document.getElementById('global-thresh-p50');
  const p90Input = document.getElementById('global-thresh-p90');
  const p95Input = document.getElementById('global-thresh-p95');
  const p99Input = document.getElementById('global-thresh-p99');

  if (p50Input) p50Input.value = state.globalThresholds?.p50 ?? DEFAULT_GLOBAL_THRESHOLDS.p50;
  if (p90Input) p90Input.value = state.globalThresholds?.p90 ?? DEFAULT_GLOBAL_THRESHOLDS.p90;
  if (p95Input) p95Input.value = state.globalThresholds?.p95 ?? DEFAULT_GLOBAL_THRESHOLDS.p95;
  if (p99Input) p99Input.value = state.globalThresholds?.p99 ?? DEFAULT_GLOBAL_THRESHOLDS.p99;
}

export function onGlobalThresholdInputChange(metric, value) {
  const num = parseInt(value, 10);
  if (!state.globalThresholds) {
    state.globalThresholds = { ...DEFAULT_GLOBAL_THRESHOLDS };
  }
  if (!isNaN(num) && num > 0) {
    state.globalThresholds[metric] = num;
  } else {
    state.globalThresholds[metric] = DEFAULT_GLOBAL_THRESHOLDS[metric];
  }
  saveThresholdsToLocalStorage();
  syncJsonFromVisualForm();
}

export function resetGlobalThresholdsToDefault() {
  state.globalThresholds = { ...DEFAULT_GLOBAL_THRESHOLDS };
  saveThresholdsToLocalStorage();
  renderGlobalThresholdInputs();
  syncJsonFromVisualForm();
  showToast('Global response time thresholds reset to default SLA values', 'info');
}

export function syncJsonFromVisualForm() {
  renderGlobalThresholdInputs();
  const scriptObj = buildScriptJsonFromState();
  const editor = document.getElementById('json-editor-textarea');
  if (editor) {
    editor.value = JSON.stringify(scriptObj, null, 2);
  }
  validateCurrentEditorJson();
}

export function onJsonEditorInput() {
  state.isJsonValid = false;
  const startBtn = document.getElementById('btn-start-test');
  if (startBtn) startBtn.disabled = true;

  const banner = document.getElementById('validation-banner');
  if (banner) {
    banner.className = 'rounded-2xl p-4 border bg-amber-950/30 border-amber-500/40 text-xs text-amber-300';
    banner.innerHTML = `⚠️ <strong>JSON modified manually:</strong> Click <strong>"✓ Validate JSON Now"</strong> to verify the configuration before launching the test.`;
  }
}

export async function validateCurrentEditorJson() {
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

export function renderScriptVisualSummary(scriptObj, summary) {
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
                <span class="text-sky-300">⏱ ${
                  st.thinkTimeRange?.enabled
                    ? `${st.thinkTimeRange.min ?? 1}-${st.thinkTimeRange.max ?? 3}s (rand)`
                    : `${st.thinkTimeSec ?? 1}s`
                }</span>
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

export function exportScriptJson() {
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

export function applyScriptJsonToVisualState(scriptObj, options = {}, callbacks = {}) {
  if (!scriptObj || typeof scriptObj !== 'object') return false;

  const { silent = false, keepStages = false } = options;
  const { renderCatalogSelector, renderSelectedEndpointsConfig } = callbacks;

  const gc = scriptObj.globalConfig || {};
  if (gc.testName) {
    const el = document.getElementById('input-test-name');
    if (el) el.value = gc.testName;
  }
  if (gc.environment) {
    const el = document.getElementById('input-environment');
    if (el) {
      el.value = gc.environment;
      onEnvironmentChange(gc.environment, true);
    }
  }
  if (gc.baseUrl) {
    const el = document.getElementById('input-base-url');
    if (el) el.value = gc.baseUrl;
  }

  if (!keepStages && Array.isArray(gc.stages) && gc.stages.length > 0) {
    state.stages = gc.stages.map((st, i) => ({
      name: typeof st.name === 'string' && st.name.trim() ? st.name : `Stage ${i + 1}`,
      duration: String(st.duration || '30s').trim()
    }));
    saveStagesToLocalStorage();
    renderStages();
  }

  if (gc.thresholds && typeof gc.thresholds === 'object') {
    state.globalThresholds = {
      p50: Number(gc.thresholds.p50MaxDurationMs) || DEFAULT_GLOBAL_THRESHOLDS.p50,
      p90: Number(gc.thresholds.p90MaxDurationMs) || DEFAULT_GLOBAL_THRESHOLDS.p90,
      p95: Number(gc.thresholds.p95MaxDurationMs) || DEFAULT_GLOBAL_THRESHOLDS.p95,
      p99: Number(gc.thresholds.p99MaxDurationMs) || DEFAULT_GLOBAL_THRESHOLDS.p99,
      maxErrorRate: Number(gc.thresholds.maxErrorRate) || DEFAULT_GLOBAL_THRESHOLDS.maxErrorRate,
    };
    saveThresholdsToLocalStorage();
    renderGlobalThresholdInputs();
  }

  const importedScenarios = Array.isArray(scriptObj.scenarios) ? scriptObj.scenarios : [];
  if (importedScenarios.length > 0) {
    state.scenarios = importedScenarios.map((sc, sIdx) => {
      const scId = sc.id || `scenario_${sIdx + 1}`;
      const alignedVUs = state.stages.map((_, stageIdx) => {
        if (Array.isArray(sc.usersPerStage) && sc.usersPerStage[stageIdx] !== undefined) {
          return Number(sc.usersPerStage[stageIdx]) || 0;
        }
        return 5;
      });

      const restoredSteps = (sc.steps || []).map((st, stepIdx) => {
        const epId = st.endpointId || st.id || 'callPMSNewMessages';
        const baseTpl = state.endpointsState[epId] || {};
        const stepInstance = {
          stepId: st.stepId || `step_${Date.now()}_${stepIdx}`,
          endpointId: epId,
          id: epId,
          name: st.name || baseTpl.name || epId,
          displayName: st.displayName || baseTpl.displayName || st.name || epId,
          category: st.category || baseTpl.category || 'SOAP Service',
          enabled: st.enabled !== false,
          protocol: st.protocol || baseTpl.protocol || 'SOAP',
          soapVersion: st.soapVersion || baseTpl.soapVersion || '1.2',
          service: st.service || baseTpl.service || '',
          soapAction: st.soapAction ?? baseTpl.soapAction ?? null,
          operationName: st.operationName || baseTpl.operationName || '',
          xmlNamespace: st.xmlNamespace || baseTpl.xmlNamespace || 'http://tempuri.org/',
          timeout: st.timeout || baseTpl.timeout || '60s',
          thinkTimeSec: st.thinkTimeSec ?? baseTpl.thinkTimeSec ?? 1.0,
          thinkTimeRange: st.thinkTimeRange
            ? JSON.parse(JSON.stringify(st.thinkTimeRange))
            : baseTpl.thinkTimeRange
            ? JSON.parse(JSON.stringify(baseTpl.thinkTimeRange))
            : { enabled: true, min: 1.0, max: 3.0 },
          dataRequirements: JSON.parse(JSON.stringify(baseTpl.dataRequirements || {})),
          data: {},
          thresholds: baseTpl.thresholds ? JSON.parse(JSON.stringify(baseTpl.thresholds)) : {},
          assertions: baseTpl.assertions ? JSON.parse(JSON.stringify(baseTpl.assertions)) : []
        };

        if (st.data && typeof st.data === 'object') {
          stepInstance.data = { ...stepInstance.data, ...JSON.parse(JSON.stringify(st.data)) };
        }
        if (st.thresholds && typeof st.thresholds === 'object') {
          stepInstance.thresholds = { ...stepInstance.thresholds, ...JSON.parse(JSON.stringify(st.thresholds)) };
        }
        if (Array.isArray(st.assertions) && st.assertions.length > 0) {
          stepInstance.assertions = JSON.parse(JSON.stringify(st.assertions));
        }

        stepInstance.name = st.name || stepInstance.name;
        stepInstance.enabled = st.enabled !== false;
        stepInstance.drawerOpen = false;
        return stepInstance;
      });

      return {
        id: scId,
        name: sc.name || `Scenario ${sIdx + 1}`,
        enabled: sc.enabled !== false,
        usersPerStage: alignedVUs,
        steps: restoredSteps
      };
    });

    state.activeScenarioId = state.scenarios[0]?.id || null;
  }

  if (typeof renderCatalogSelector === 'function') renderCatalogSelector();
  if (typeof renderSelectedEndpointsConfig === 'function') renderSelectedEndpointsConfig();

  if (!silent) {
    showToast('Applied configuration to visual scenarios.', 'info');
  }
  return true;
}

export function importScriptJson(event, callbacks = {}) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const editor = document.getElementById('json-editor-textarea');
      if (editor) {
        editor.value = JSON.stringify(parsed, null, 2);
      }
      applyScriptJsonToVisualState(parsed, { silent: true }, callbacks);
      await validateCurrentEditorJson();
      showToast(`Imported ${file.name} and synced with visual scenarios`, 'info');
    } catch (err) {
      showToast(`Invalid JSON file: ${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
