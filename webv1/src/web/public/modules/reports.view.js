/**
 * Reports History View Module
 */

import { escapeHtml } from './state.js';

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
        const threshBadgeHtml =
          threshPassed === true
            ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">✓ SLA PASSED</span>`
            : threshPassed === false
            ? `<span class="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold">✕ SLA EXCEEDED</span>`
            : '';

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
                ${threshBadgeHtml}
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
