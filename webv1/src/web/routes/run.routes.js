import { Router } from 'express';
import { validatePerformanceScript } from '../../validator/script-validator.js';

/**
 * Creates run API router.
 * @param {ReturnType<import('../services/run-execution.service.js').createRunExecutionService>} runService
 */
export function createRunRouter(runService) {
  const router = Router();

  // POST /api/validate - Validates a script configuration
  router.post('/validate', (req, res) => {
    const scriptObj = req.body;
    const result = validatePerformanceScript(scriptObj);
    res.json(result);
  });

  // GET /api/run/status - Returns current or last test run state
  router.get('/run/status', (req, res) => {
    res.json(runService.getStatus());
  });

  // GET /api/run/stream - SSE stream for live telemetry and logs
  router.get('/run/stream', (req, res) => {
    const unregister = runService.registerSseClient(res);
    req.on('close', unregister);
  });

  // POST /api/run - Launches a new performance test run
  router.post('/run', (req, res) => {
    const result = runService.startRun(req.body);
    res.status(result.status).json(result.body);
  });

  // POST /api/run/stop - Stops active k6 execution
  router.post('/run/stop', (req, res) => {
    const result = runService.stopRun();
    if (!result.stopped && result.message?.includes('No performance test')) {
      return res.status(400).json(result);
    }
    if (!result.stopped) {
      return res.status(500).json(result);
    }
    res.json(result);
  });

  return router;
}
