import {
  state,
  DEFAULT_STAGES,
  saveStagesToLocalStorage,
  saveEnvironmentToLocalStorage,
  escapeHtml,
  showToast
} from './state.js';

export function parseDurationToSecondsClient(durationStr) {
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

export function formatTotalDurationSeconds(sec) {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0 && s > 0) return `${m}m ${s}s (${sec}s)`;
  if (m > 0) return `${m}m (${sec}s)`;
  return `${s}s`;
}

export function updateTotalDurationBadge() {
  const badge = document.getElementById('total-duration-badge');
  if (!badge) return;
  const totalSec = state.stages.reduce((acc, st) => acc + parseDurationToSecondsClient(st.duration), 0);
  badge.textContent = `Total Duration: ${formatTotalDurationSeconds(totalSec)}`;
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

export function renderStages(onStageChangeCallback) {
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
              ? `<button onclick="window.removeStage(${idx})" class="text-[11px] text-slate-500 hover:text-rose-400 transition" title="Remove stage">✕</button>`
              : ''
          }
        </div>
        <div>
          <label class="block text-[10px] text-slate-400 mb-0.5">Stage Label</label>
          <input type="text" value="${escapeHtml(st.name || `Stage ${idx + 1}`)}"
            oninput="window.updateStageName(${idx}, this.value)"
            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500" />
        </div>
        <div>
          <label class="block text-[10px] text-slate-400 mb-0.5">Duration (e.g. 30s, 1m)</label>
          <input type="text" value="${escapeHtml(st.duration)}"
            oninput="window.updateStageDuration(${idx}, this.value)"
            class="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:border-sky-500" />
        </div>
      </div>
    `
    )
    .join('');

  updateTotalDurationBadge();
  if (typeof onStageChangeCallback === 'function') {
    onStageChangeCallback();
  }
}

export function addStage(renderScenariosCallback) {
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
  renderStages(renderScenariosCallback);
  if (typeof renderScenariosCallback === 'function') {
    renderScenariosCallback();
  }
}

export function removeStage(idx, renderScenariosCallback) {
  if (state.stages.length <= 1) return;
  state.stages.splice(idx, 1);
  saveStagesToLocalStorage();
  Object.values(state.endpointsState).forEach((ep) => {
    ep.usersPerStage.splice(idx, 1);
  });
  state.scenarios.forEach((sc) => {
    sc.usersPerStage.splice(idx, 1);
  });
  renderStages(renderScenariosCallback);
  if (typeof renderScenariosCallback === 'function') {
    renderScenariosCallback();
  }
}

export function updateStageName(idx, val) {
  if (state.stages[idx]) {
    state.stages[idx].name = val;
    saveStagesToLocalStorage();
    document.querySelectorAll(`.ep-stage-header-${idx}`).forEach((el) => {
      el.textContent = `S${idx + 1} (${state.stages[idx].duration})`;
    });
  }
}

export function updateStageDuration(idx, val) {
  if (state.stages[idx]) {
    state.stages[idx].duration = val.trim();
    saveStagesToLocalStorage();
    updateTotalDurationBadge();
    document.querySelectorAll(`.ep-stage-header-${idx}`).forEach((el) => {
      el.textContent = `S${idx + 1} (${state.stages[idx].duration})`;
    });
  }
}

export function resetDefaultStages(renderScenariosCallback) {
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

  renderStages(renderScenariosCallback);
  if (typeof renderScenariosCallback === 'function') {
    renderScenariosCallback();
  }
  showToast('Restored default global stage durations.', 'info');
}
