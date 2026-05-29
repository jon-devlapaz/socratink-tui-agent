const SPACING_INTERVAL_MS = 18 * 60 * 60 * 1000;

function attemptsFor(record) {
  return Array.isArray(record?.attempts) ? record.attempts : [];
}

function parseTime(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function addSpacingInterval(iso) {
  const ms = parseTime(iso);
  if (ms === null) return null;
  return new Date(ms + SPACING_INTERVAL_MS).toISOString();
}

function spacingOk(priorAttempt, currentAttempt) {
  const priorMs = parseTime(priorAttempt?.at);
  const currentMs = parseTime(currentAttempt?.at);
  if (priorMs === null || currentMs === null) return false;
  return currentMs - priorMs >= SPACING_INTERVAL_MS;
}

function spacingOkAt(attempt, now) {
  const attemptMs = parseTime(attempt?.at);
  const nowMs = parseTime(now);
  if (attemptMs === null || nowMs === null) return false;
  return nowMs - attemptMs >= SPACING_INTERVAL_MS;
}

function deriveState(attempts) {
  let state = null;
  let priorAttempt = null;
  let failureStreak = 0;

  attempts.forEach((attempt) => {
    if (attempt?.classification === 'strong') {
      state = priorAttempt?.classification === 'strong' && spacingOk(priorAttempt, attempt)
        ? 'solidified'
        : 'primed';
      failureStreak = 0;
    } else if (attempt?.classification === 'partial') {
      state = 'primed';
      // Preserve failureStreak so alternating weak/partial attempts cannot
      // park a node in primed forever.
    } else if (attempt?.classification === 'thin' || attempt?.classification === 'wrong_direction') {
      state = failureStreak >= 1 || state === null
        ? 'needs repair'
        : 'primed';
      failureStreak += 1;
    } else {
      priorAttempt = attempt;
      return;
    }

    priorAttempt = attempt;
  });

  return state;
}

function deriveNextAction({ state, latestAttempt, record, now }) {
  if (!latestAttempt) return 'cold_attempt';
  if (state === 'solidified') return null;
  if (!record?.study_revealed_at) return 'study';

  if (state === 'needs repair') {
    return 'repair';
  }

  if (state === 'primed') {
    if (latestAttempt.classification === 'strong') {
      return spacingOkAt(latestAttempt, now) ? 'spaced_attempt' : 'review';
    }
    return 'repair';
  }

  return null;
}

export function deriveNodeTraining(record, { now = new Date().toISOString() } = {}) {
  const attempts = attemptsFor(record);
  const latestAttempt = attempts.at(-1) || null;
  const state = deriveState(attempts);
  const nextAction = deriveNextAction({ state, latestAttempt, record: record || {}, now });

  return {
    state,
    next_action: nextAction,
    strongest_turn_text: latestAttempt?.user_text || null,
    gaps: Array.isArray(latestAttempt?.gaps) ? latestAttempt.gaps : [],
    solidify_unlocks_at:
      state === 'primed'
      && latestAttempt?.classification === 'strong'
      && record?.study_revealed_at
      && !spacingOkAt(latestAttempt, now)
        ? addSpacingInterval(latestAttempt.at)
        : null,
    last_attempt_at: latestAttempt?.at || null,
  };
}

export function deriveConceptStatus(training, nodeIds = [], options = {}) {
  const ids = Array.isArray(nodeIds) ? nodeIds : [];
  const records = training?.node_records && typeof training.node_records === 'object'
    ? training.node_records
    : {};

  const composition = {
    untested: 0,
    primed: 0,
    needs_repair: 0,
    solidified: 0,
    total: ids.length,
  };

  ids.forEach((nodeId) => {
    const state = deriveNodeTraining(records[nodeId] || null, options).state;
    if (state === null) composition.untested += 1;
    else if (state === 'primed') composition.primed += 1;
    else if (state === 'needs repair') composition.needs_repair += 1;
    else if (state === 'solidified') composition.solidified += 1;
  });

  const tested = composition.total - composition.untested;
  let badge = null;
  if (tested > 0) {
    if (composition.needs_repair > 0) badge = 'needs repair';
    else if (composition.primed > 0) badge = 'primed';
    else badge = 'solidified';
  }

  return { badge, composition };
}
