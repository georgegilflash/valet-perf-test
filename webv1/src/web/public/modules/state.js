/**
 * Global State and LocalStorage helpers
 */

export const STAGES_STORAGE_KEY = 'valet_perf_studio_stages_v1';
export const ENV_STORAGE_KEY = 'valet_perf_studio_env_v1';
export const LAYOUTS_STORAGE_KEY = 'valet_perf_saved_layouts_v1';
export const LAST_RUNS_STORAGE_KEY = 'valet_perf_last_runs_v1';
export const THRESHOLDS_STORAGE_KEY = 'valet_perf_default_thresholds_v1';

export const DEFAULT_GLOBAL_THRESHOLDS = {
  p50: 500,
  p90: 1000,
  p95: 2500,
  p99: 5000,
  maxErrorRate: 0.01
};

export const DEFAULT_STAGES = [
  { name: 'Stage 1 (Warm-up)', duration: '30s' },
  { name: 'Stage 2 (Ramp-up)', duration: '1m' },
  { name: 'Stage 3 (Peak Load)', duration: '2m' },
  { name: 'Stage 4 (Scale-down)', duration: '1m' },
  { name: 'Stage 5 (Cool-down)', duration: '30s' }
];

export const state = {
  catalog: [],
  pools: {
    locationIds: [],
    locationIdsQa3: [],
    kioskIds: [],
    userGuids: []
  },
  stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)),
  globalThresholds: { ...DEFAULT_GLOBAL_THRESHOLDS },
  endpointsState: {},
  scenarios: [],
  activeScenarioId: null,
  dragPayload: null,
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

export function loadStagesFromLocalStorage() {
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

export function saveStagesToLocalStorage() {
  try {
    window.localStorage.setItem(STAGES_STORAGE_KEY, JSON.stringify(state.stages));
  } catch (err) {
    console.warn('Could not save stages to localStorage:', err);
  }
}

export function loadEnvironmentFromLocalStorage(onEnvChangedCallback) {
  try {
    const savedEnv = window.localStorage.getItem(ENV_STORAGE_KEY);
    if (!savedEnv) return;
    const envSelect = document.getElementById('input-environment');
    if (envSelect && ['QA1', 'QA2', 'QA3'].includes(savedEnv)) {
      envSelect.value = savedEnv;
      if (typeof onEnvChangedCallback === 'function') {
        onEnvChangedCallback(savedEnv, false);
      }
    }
  } catch (err) {
    console.warn('Could not load saved environment from localStorage:', err);
  }
}

export function saveEnvironmentToLocalStorage(env) {
  try {
    window.localStorage.setItem(ENV_STORAGE_KEY, env);
  } catch (err) {
    console.warn('Could not save environment to localStorage:', err);
  }
}

export function loadThresholdsFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state.globalThresholds = {
        p50: Number(parsed.p50) || DEFAULT_GLOBAL_THRESHOLDS.p50,
        p90: Number(parsed.p90) || DEFAULT_GLOBAL_THRESHOLDS.p90,
        p95: Number(parsed.p95) || DEFAULT_GLOBAL_THRESHOLDS.p95,
        p99: Number(parsed.p99) || DEFAULT_GLOBAL_THRESHOLDS.p99,
        maxErrorRate: Number(parsed.maxErrorRate) || DEFAULT_GLOBAL_THRESHOLDS.maxErrorRate,
      };
    }
  } catch (err) {
    console.warn('Could not load saved thresholds from localStorage:', err);
  }
}

export function saveThresholdsToLocalStorage() {
  try {
    window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(state.globalThresholds));
  } catch (err) {
    console.warn('Could not save thresholds to localStorage:', err);
  }
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'info') {
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
