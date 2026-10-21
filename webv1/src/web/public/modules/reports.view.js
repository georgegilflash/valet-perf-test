/**
 * Reports History View Module
 */

import { escapeHtml, showToast } from './state.js';

export async function loadReportsHistory() {
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
        const threshPassed = run.summaryStats?.thresholdsPassed ?? run.thresholdResults?.passed;
        const failureType = run.summaryStats?.failureType || run.thresholdResults?.failureType;

        let threshBadgeHtml = '';
        if (failureType === 'CONFIG_ERROR') {
          threshBadgeHtml = `<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold tracking-wide">🚫 CONFIG / HOST ERROR</span>`;
        } else if (threshPassed === true) {
          threshBadgeHtml = `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold tracking-wide">✓ SLA PASSED</span>`;
        } else if (threshPassed === false) {
          threshBadgeHtml = `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold tracking-wide">⚠️ SLA EXCEEDED</span>`;
        }

        const epLinksHtml = (run.endpointReports || [])
          .filter((ep) => ep.exists)
          .map(
            (ep) => `
            <a href="${ep.url}" target="_blank"
              class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap"
              title="Endpoint report: ${escapeHtml(ep.name)}">
              <span>🔌 ${escapeHtml(ep.name)}</span>
              <span class="text-slate-400 font-mono text-[10px] bg-slate-900 px-1 py-0.5 rounded">[${(ep.usersPerStage || []).join(',')}]</span>
            </a>
          `
          )
          .join('');

        return `
          <div class="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
            
            <!-- Columna 1: Info General, Metadatos y Percentiles (Ocupa 7 de 12) -->
            <div class="xl:col-span-7 space-y-2 min-w-0">
              <!-- Fila 1: ID, Ambiente, Badge SLA y Test Name -->
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-bold text-white font-mono tracking-tight">${escapeHtml(run.runId)}</span>
                <span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-semibold">
                  ${escapeHtml(run.environment)}
                </span>
                ${threshBadgeHtml}
                <span class="text-xs text-slate-300 font-medium truncate max-w-xs" title="${escapeHtml(run.testName)}">
                  ${escapeHtml(run.testName)}
                </span>
              </div>

              <!-- Fila 2: Base URL y Stages -->
              <div class="text-[11px] text-slate-400 font-mono truncate" title="Base URL: ${escapeHtml(run.baseUrl)} | Stages: [${escapeHtml(stagesText || 'N/A')}]">
                <span class="text-slate-500">Base URL:</span> ${escapeHtml(run.baseUrl)} 
                <span class="text-slate-600 px-1">·</span> 
                <span class="text-slate-500">Stages:</span> [${escapeHtml(stagesText || 'N/A')}]
              </div>

              <!-- Fila 3: Tarjetas de métricas compactas (Reqs, p50, p90, p95, p99) -->
              ${
                run.summaryStats
                  ? `<div class="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] font-mono">
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

            <!-- Columna 2: Botones de Reportes y Endpoints (Ocupa 4 de 12) -->
            <div class="xl:col-span-4 flex flex-wrap items-center justify-start xl:justify-end gap-2">
              ${
                run.hasGeneralReport
                  ? `<a href="${run.generalReportUrl}" target="_blank"
                      class="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition flex items-center gap-1 whitespace-nowrap">
                      <span>📊 General Report</span>
                    </a>`
                  : ''
              }
              ${epLinksHtml}
              <a href="${run.scriptJsonUrl}" target="_blank"
                class="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-xs font-mono transition whitespace-nowrap"
                title="View test-performance-script.json">
                { } Script
              </a>
            </div>

            <!-- Columna 3: Acción de Eliminar Dedicada (Ocupa 1 de 12) -->
            <div class="xl:col-span-1 flex items-center justify-end xl:border-l xl:border-slate-800/80 xl:pl-3">
              <button onclick="deleteSingleReport('${escapeHtml(run.runId)}')"
                class="p-2 rounded-xl bg-slate-950 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-800 text-xs transition flex items-center justify-center"
                title="Delete this test report">
                🗑️
              </button>
            </div>

          </div>
        `;
      })
      .join('');
  } catch (err) {
    container.innerHTML = `<div class="text-rose-400 text-xs">Error loading reports history: ${escapeHtml(err.message)}</div>`;
  }
}

export async function deleteSingleReport(runId) {
  if (!confirm(`Are you sure you want to delete report ${runId}?`)) return;
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(runId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Deleted report ${runId}`, 'info');
      await loadReportsHistory();
    } else {
      showToast(data.error || 'Failed to delete report', 'error');
    }
  } catch (err) {
    showToast(`Error deleting report: ${err.message}`, 'error');
  }
}

export async function clearAllReportsHistory() {
  if (!confirm('Are you sure you want to delete ALL test reports in the history? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/reports', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Cleared ${data.deletedCount || 0} historical reports`, 'info');
      await loadReportsHistory();
    } else {
      showToast(data.error || 'Failed to clear reports', 'error');
    }
  } catch (err) {
    showToast(`Error clearing reports: ${err.message}`, 'error');
  }
}
