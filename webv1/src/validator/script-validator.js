/**
 * Validator for `test-performance-script` JSON configuration.
 * Supports multi-step Scenarios (`scenarios[].steps[]`) as well as flat `endpoints[]`.
 * Validates schema, k6 duration strings, stages alignment, ID string arrays, assertions, and thresholds.
 */

const DURATION_REGEX = /^\d+(\.\d+)?(ms|s|m|h)$/;

/**
 * Parses a k6 duration string (e.g. '30s', '2m', '1h', '500ms') into seconds.
 * @param {string} durationStr
 * @returns {number} seconds (or NaN if invalid)
 */
export function parseDurationToSeconds(durationStr) {
  if (typeof durationStr !== 'string') return NaN;
  const trimmed = durationStr.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) return NaN;
  const val = parseFloat(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'ms':
      return val / 1000;
    case 's':
      return val;
    case 'm':
      return val * 60;
    case 'h':
      return val * 3600;
    default:
      return NaN;
  }
}

/**
 * Normalizes a script config so that both `scenarios` (multi-step) and `endpoints`
 * (distinct tested endpoints) can be inspected uniformly.
 */
export function extractNormalizedScenariosAndEndpoints(script) {
  if (!script || typeof script !== 'object') {
    return { scenarios: [], distinctEndpoints: [] };
  }

  let scenarios = [];

  if (Array.isArray(script.scenarios) && script.scenarios.length > 0) {
    scenarios = script.scenarios;
  } else if (Array.isArray(script.endpoints) && script.endpoints.length > 0) {
    // Backward compatibility: convert flat endpoints into 1-step scenarios
    scenarios = script.endpoints.map((ep, idx) => ({
      id: `scenario_${ep.id || idx + 1}`,
      name: ep.displayName || ep.name || `Scenario ${idx + 1}`,
      enabled: ep.enabled !== false,
      usersPerStage: Array.isArray(ep.usersPerStage) ? ep.usersPerStage : [],
      steps: [
        {
          stepId: `step_${idx + 1}_1`,
          endpointId: ep.id,
          ...ep
        }
      ]
    }));
  }

  // Collect distinct enabled endpoints across all enabled scenarios
  const endpointMap = new Map();
  scenarios
    .filter((sc) => sc && sc.enabled !== false)
    .forEach((sc) => {
      const steps = Array.isArray(sc.steps) ? sc.steps : [];
      steps.forEach((step) => {
        if (!step || step.enabled === false) return;
        const epId = step.endpointId || step.id;
        if (!epId) return;

        if (!endpointMap.has(epId)) {
          endpointMap.set(epId, {
            ...step,
            id: epId,
            endpointId: epId,
            enabled: true,
            usersPerStage: Array.isArray(sc.usersPerStage) ? [...sc.usersPerStage] : []
          });
        } else {
          // Merge peak VUs per stage if used in multiple scenarios
          const existing = endpointMap.get(epId);
          if (Array.isArray(sc.usersPerStage)) {
            existing.usersPerStage = sc.usersPerStage.map(
              (vu, i) => Math.max(existing.usersPerStage[i] || 0, vu || 0)
            );
          }
        }
      });
    });

  return {
    scenarios,
    distinctEndpoints: Array.from(endpointMap.values())
  };
}

/**
 * Validates a single step/endpoint definition inside a scenario.
 */
function validateStepDefinition(step, label, maxVuForScenario, errors, warnings) {
  const epId = step.endpointId || step.id;
  if (!epId || typeof epId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(epId)) {
    errors.push(
      `${label}: "endpointId" (or "id") is required and must only contain letters, numbers, hyphens, or underscores.`
    );
  }

  if (!step.service || typeof step.service !== 'string' || !step.service.trim()) {
    errors.push(`${label}: "service" (endpoint path, e.g. "/device/pms.asmx") is required.`);
  }

  const protocol = (step.protocol || 'SOAP').toUpperCase();
  if (protocol !== 'SOAP' && protocol !== 'REST') {
    errors.push(`${label}: "protocol" must be "SOAP" or "REST".`);
  }

  if (protocol === 'SOAP') {
    const ver = String(step.soapVersion || '1.1');
    if (ver !== '1.1' && ver !== '1.2') {
      errors.push(`${label}: "soapVersion" must be "1.1" or "1.2".`);
    }
    if (!step.operationName && !step.customXmlBody) {
      errors.push(
        `${label}: a SOAP step must define either "operationName" (e.g. "NewMessages", "Ping") or "customXmlBody".`
      );
    }
  }

  if (!step.timeout || !DURATION_REGEX.test(String(step.timeout).trim())) {
    errors.push(
      `${label}: "timeout" ("${step.timeout}") is invalid. Use k6 format (e.g. "30s", "60s", "90s").`
    );
  }

  if (step.thinkTimeSec !== undefined && (typeof step.thinkTimeSec !== 'number' || step.thinkTimeSec < 0)) {
    errors.push(`${label}: "thinkTimeSec" must be a number greater than or equal to 0.`);
  }

  // Validate think time range (min-max) if defined
  if (step.thinkTimeRange !== undefined && step.thinkTimeRange !== null) {
    if (typeof step.thinkTimeRange !== 'object') {
      errors.push(`${label}: "thinkTimeRange" must be an object with min and max numbers.`);
    } else {
      const { min, max } = step.thinkTimeRange;
      if (min !== undefined && (typeof min !== 'number' || min < 0)) {
        errors.push(`${label}: "thinkTimeRange.min" must be a number greater than or equal to 0.`);
      }
      if (max !== undefined && (typeof max !== 'number' || max < 0)) {
        errors.push(`${label}: "thinkTimeRange.max" must be a number greater than or equal to 0.`);
      }
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        errors.push(`${label}: "thinkTimeRange.min" (${min}s) cannot be greater than "thinkTimeRange.max" (${max}s).`);
      }
    }
  }

  // Validate Data block & ID arrays
  if (!step.data || typeof step.data !== 'object') {
    errors.push(`${label}: missing "data" block with IDs/parameters configuration.`);
  } else {
    const idArrayKeys = ['locationIds', 'locationIdsQa3', 'kioskIds', 'userGuids', 'customIds'].filter(
      (k) => step.data[k] !== undefined
    );

    if (idArrayKeys.length === 0 && !step.customXmlBody) {
      warnings.push(
        `${label}: No ID array ("locationIds", "locationIdsQa3", "kioskIds", or "userGuids") was defined in "data".`
      );
    }

    idArrayKeys.forEach((key) => {
      const arr = step.data[key];
      if (!Array.isArray(arr) || arr.length === 0) {
        errors.push(`${label}: "data.${key}" must be a non-empty array of strings.`);
      } else {
        const invalidItems = arr.filter((item) => typeof item !== 'string' || !item.trim());
        if (invalidItems.length > 0) {
          errors.push(`${label}: all elements in "data.${key}" must be non-empty strings.`);
        }
        if (step.data.selectionMode === 'per-vu' && arr.length < maxVuForScenario) {
          warnings.push(
            `${label}: mode is "per-vu" with peak of ${maxVuForScenario} VUs, but "data.${key}" only has ${arr.length} IDs (IDs will cycle).`
          );
        }
      }
    });
  }

  // Thresholds validation
  if (step.thresholds && typeof step.thresholds === 'object') {
    const percentiles = ['p50MaxDurationMs', 'p90MaxDurationMs', 'p95MaxDurationMs', 'p99MaxDurationMs'];
    percentiles.forEach((pKey) => {
      if (
        step.thresholds[pKey] !== undefined &&
        step.thresholds[pKey] !== null &&
        (typeof step.thresholds[pKey] !== 'number' || step.thresholds[pKey] <= 0)
      ) {
        errors.push(`${label}: "thresholds.${pKey}" must be a positive number in ms.`);
      }
    });

    if (
      step.thresholds.maxErrorRate !== undefined &&
      step.thresholds.maxErrorRate !== null &&
      (typeof step.thresholds.maxErrorRate !== 'number' ||
        step.thresholds.maxErrorRate < 0 ||
        step.thresholds.maxErrorRate > 1)
    ) {
      errors.push(`${label}: "thresholds.maxErrorRate" must be between 0 and 1 (e.g. 0.01 for 1%).`);
    }
  }

  // Assertions validation
  if (!Array.isArray(step.assertions) || step.assertions.length === 0) {
    warnings.push(`${label}: has no assertions configured.`);
  } else {
    const activeAssertions = step.assertions.filter((a) => a && a.enabled !== false);
    if (activeAssertions.length === 0) {
      warnings.push(`${label}: all assertions are disabled.`);
    }
  }
}

/**
 * Validates the complete test-performance-script JSON object.
 * @param {object} script
 * @returns {{ valid: boolean, errors: string[], warnings: string[], summary: object }}
 */
export function validatePerformanceScript(script) {
  const errors = [];
  const warnings = [];

  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    return {
      valid: false,
      errors: ['The payload must be a valid JSON object.'],
      warnings: [],
      summary: null
    };
  }

  if (!script.scriptName || typeof script.scriptName !== 'string') {
    errors.push('Missing required property "scriptName" (must be "test-performance-script").');
  }

  // 1. Validate globalConfig
  const globalConfig = script.globalConfig;
  if (!globalConfig || typeof globalConfig !== 'object') {
    errors.push('Missing required "globalConfig" block.');
  } else {
    if (!globalConfig.baseUrl || typeof globalConfig.baseUrl !== 'string') {
      errors.push('"globalConfig.baseUrl" is required and must be a string.');
    } else if (!/^https?:\/\/.+/i.test(globalConfig.baseUrl.trim())) {
      errors.push('"globalConfig.baseUrl" must start with http:// or https://.');
    }

    if (globalConfig.thresholds && typeof globalConfig.thresholds === 'object') {
      const gThresh = globalConfig.thresholds;
      ['p50MaxDurationMs', 'p90MaxDurationMs', 'p95MaxDurationMs', 'p99MaxDurationMs'].forEach((k) => {
        if (
          gThresh[k] !== undefined &&
          gThresh[k] !== null &&
          (typeof gThresh[k] !== 'number' || gThresh[k] <= 0)
        ) {
          errors.push(`"globalConfig.thresholds.${k}" must be a positive number in ms.`);
        }
      });
      if (
        gThresh.maxErrorRate !== undefined &&
        gThresh.maxErrorRate !== null &&
        (typeof gThresh.maxErrorRate !== 'number' || gThresh.maxErrorRate < 0 || gThresh.maxErrorRate > 1)
      ) {
        errors.push('"globalConfig.thresholds.maxErrorRate" must be between 0 and 1 (e.g. 0.01 for 1%).');
      }
    }

    if (!Array.isArray(globalConfig.stages) || globalConfig.stages.length === 0) {
      errors.push('"globalConfig.stages" must be an array with at least 1 stage.');
    } else {
      globalConfig.stages.forEach((st, idx) => {
        if (!st || typeof st !== 'object') {
          errors.push(`Stage #${idx + 1} in "globalConfig.stages" is not a valid object.`);
          return;
        }
        if (!st.duration || !DURATION_REGEX.test(String(st.duration).trim())) {
          errors.push(
            `Stage #${idx + 1}: duration "${st.duration}" is invalid. Use k6 format (e.g. "30s", "1m", "2m").`
          );
        }
      });
    }
  }

  const stagesCount = Array.isArray(globalConfig?.stages) ? globalConfig.stages.length : 0;
  const { scenarios, distinctEndpoints } = extractNormalizedScenariosAndEndpoints(script);

  if (scenarios.length === 0) {
    errors.push('At least one scenario (in "scenarios" or "endpoints") must be defined.');
  }

  const enabledScenarios = scenarios.filter((sc) => sc && sc.enabled !== false);
  if (enabledScenarios.length === 0) {
    errors.push('At least one scenario must be enabled ("enabled": true) to run the test.');
  }

  const seenScenarioIds = new Set();

  enabledScenarios.forEach((sc, scIdx) => {
    const scLabel = sc.name || sc.id || `Scenario #${scIdx + 1}`;
    const scId = sc.id || `scenario_${scIdx + 1}`;

    if (seenScenarioIds.has(scId)) {
      errors.push(`${scLabel}: scenario id "${scId}" is duplicated.`);
    } else {
      seenScenarioIds.add(scId);
    }

    let maxVuForScenario = 0;
    if (!Array.isArray(sc.usersPerStage)) {
      errors.push(`${scLabel}: "usersPerStage" must be an array of integers representing target VUs per stage.`);
    } else {
      if (stagesCount > 0 && sc.usersPerStage.length !== stagesCount) {
        errors.push(
          `${scLabel}: "usersPerStage" has ${sc.usersPerStage.length} values, but "globalConfig.stages" has ${stagesCount} stages. They must match.`
        );
      }
      sc.usersPerStage.forEach((vu, sIdx) => {
        if (typeof vu !== 'number' || !Number.isInteger(vu) || vu < 0) {
          errors.push(`${scLabel}: Stage #${sIdx + 1} in "usersPerStage" must be an integer >= 0.`);
        } else if (vu > maxVuForScenario) {
          maxVuForScenario = vu;
        }
      });
      if (maxVuForScenario === 0) {
        warnings.push(`${scLabel}: All stages have 0 virtual users (will not generate traffic).`);
      }
    }

    if (!Array.isArray(sc.steps) || sc.steps.length === 0) {
      errors.push(`${scLabel}: must contain at least 1 step in "steps" (drag an endpoint into the scenario).`);
    } else {
      sc.steps.forEach((step, stepIdx) => {
        if (!step || typeof step !== 'object') {
          errors.push(`${scLabel} -> Step #${stepIdx + 1}: invalid step object.`);
          return;
        }
        const stepLabel = `${scLabel} → Step #${stepIdx + 1} (${step.name || step.endpointId || step.id || 'unnamed'})`;
        validateStepDefinition(step, stepLabel, maxVuForScenario, errors, warnings);
      });
    }
  });

  // Calculate summary stats for UI preview
  const totalDurationSeconds = Array.isArray(globalConfig?.stages)
    ? globalConfig.stages.reduce((acc, st) => {
        const sec = parseDurationToSeconds(st?.duration);
        return acc + (isNaN(sec) ? 0 : sec);
      }, 0)
    : 0;

  const totalPeakVUs = enabledScenarios.reduce((sum, sc) => {
    const scMax = Array.isArray(sc.usersPerStage) ? Math.max(...sc.usersPerStage, 0) : 0;
    return sum + scMax;
  }, 0);

  const totalStepsCount = enabledScenarios.reduce(
    (sum, sc) => sum + (Array.isArray(sc.steps) ? sc.steps.length : 0),
    0
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      enabledScenariosCount: enabledScenarios.length,
      totalStepsCount,
      enabledEndpointsCount: distinctEndpoints.length,
      stagesCount,
      totalDurationSeconds,
      totalPeakVUs,
      scenarios: enabledScenarios.map((sc) => ({
        id: sc.id,
        name: sc.name || sc.id,
        peakVUs: Array.isArray(sc.usersPerStage) ? Math.max(...sc.usersPerStage, 0) : 0,
        stepsCount: Array.isArray(sc.steps) ? sc.steps.length : 0
      })),
      endpoints: distinctEndpoints.map((ep) => ({
        id: ep.id,
        name: ep.name || ep.id,
        peakVUs: Array.isArray(ep.usersPerStage) ? Math.max(...ep.usersPerStage, 0) : 0,
        activeAssertions: Array.isArray(ep.assertions)
          ? ep.assertions.filter((a) => a && a.enabled !== false).length
          : 0
      }))
    }
  };
}
