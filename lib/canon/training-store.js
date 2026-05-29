export const TRAINING_SCHEMA_VERSION = 1;
export const TRAINING_STORE_KEY_PREFIX = 'socratink:training:v1:';

const VALID_CLASSIFICATIONS = new Set(['strong', 'partial', 'thin', 'wrong_direction']);
const VALID_SOURCE_MODES = new Set(['source_attached', 'source_less']);
const VALID_GROUNDING = new Set(['source', 'learner_sketch', 'fixture', 'ungrounded']);

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* c8 ignore next -- non-browser/private-storage fallback */
    return null;
  }
  /* c8 ignore next -- non-browser fallback */
  return null;
}

function keyFor(conceptId, keyPrefix) {
  if (!conceptId) throw new Error('concept-id-required');
  return `${keyPrefix}${conceptId}`;
}

function emptyTraining(conceptId) {
  return {
    concept_id: conceptId,
    schema_version: TRAINING_SCHEMA_VERSION,
    source_mode: null,
    grounding: 'ungrounded',
    source_ref: null,
    sketch: null,
    node_records: {},
  };
}

function ensureNodeRecord(training, nodeId) {
  if (!nodeId) throw new Error('node-id-required');
  if (!training.node_records[nodeId]) {
    training.node_records[nodeId] = {
      attempts: [],
      repairs: [],
    };
  }
  const record = training.node_records[nodeId];
  if (!Array.isArray(record.attempts)) record.attempts = [];
  if (!Array.isArray(record.repairs)) record.repairs = [];
  return record;
}

function loadRaw(storage, conceptId, keyPrefix) {
  const raw = storage?.getItem?.(keyFor(conceptId, keyPrefix));
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.node_records || typeof parsed.node_records !== 'object') {
    parsed.node_records = {};
  }
  return parsed;
}

function persist(storage, conceptId, keyPrefix, training) {
  storage?.setItem?.(keyFor(conceptId, keyPrefix), JSON.stringify(training));
}

function validateAttempt(attempt) {
  if (!attempt?.id) throw new Error('attempt-id-required');
  if (!attempt?.at) throw new Error('attempt-at-required');
  if (typeof attempt.user_text !== 'string' || attempt.user_text.trim() === '') {
    throw new Error('user-text-required');
  }
  if (!VALID_CLASSIFICATIONS.has(attempt.classification)) {
    throw new Error('classification-invalid');
  }
  if (!attempt.grader_version) throw new Error('grader-version-required');
  if (!Array.isArray(attempt.gaps)) throw new Error('gaps-required');
}

function validateRepair(repair) {
  if (!repair?.id) throw new Error('repair-id-required');
  if (!repair?.at) throw new Error('repair-at-required');
  if (typeof repair.text !== 'string' || repair.text.trim() === '') {
    throw new Error('repair-text-required');
  }
}

function validateProvenance(provenance) {
  if (!VALID_SOURCE_MODES.has(provenance?.source_mode)) {
    throw new Error('source-mode-invalid');
  }
  if (!VALID_GROUNDING.has(provenance?.grounding)) {
    throw new Error('grounding-invalid');
  }
  if (
    provenance.source_ref !== null
    && provenance.source_ref !== undefined
    && typeof provenance.source_ref !== 'object'
  ) {
    throw new Error('source-ref-invalid');
  }
}

export function createTrainingStore({
  storage = defaultStorage(),
  keyPrefix = TRAINING_STORE_KEY_PREFIX,
} = {}) {
  async function loadTraining(conceptId) {
    if (!storage) return null;
    return loadRaw(storage, conceptId, keyPrefix);
  }

  async function saveTraining(training) {
    if (!storage) return;
    if (!training?.concept_id) throw new Error('concept-id-required');
    const normalized = {
      ...training,
      schema_version: TRAINING_SCHEMA_VERSION,
      node_records: training.node_records && typeof training.node_records === 'object'
        ? training.node_records
        : {},
    };
    persist(storage, normalized.concept_id, keyPrefix, normalized);
  }

  async function deleteTraining(conceptId) {
    if (!storage) return;
    storage.removeItem?.(keyFor(conceptId, keyPrefix));
  }

  async function mutateTraining(conceptId, mutator) {
    if (!storage) return null;
    const training = loadRaw(storage, conceptId, keyPrefix) || emptyTraining(conceptId);
    mutator(training);
    training.schema_version = TRAINING_SCHEMA_VERSION;
    persist(storage, conceptId, keyPrefix, training);
    return training;
  }

  async function setSketch(conceptId, sketch) {
    if (!sketch || typeof sketch.text !== 'string') throw new Error('sketch-text-required');
    if (!sketch.at) throw new Error('sketch-at-required');
    return mutateTraining(conceptId, (training) => {
      training.sketch = {
        text: sketch.text,
        at: sketch.at,
      };
    });
  }

  async function setProvenance(conceptId, provenance) {
    validateProvenance(provenance);
    return mutateTraining(conceptId, (training) => {
      training.source_mode = provenance.source_mode;
      training.grounding = provenance.grounding;
      training.source_ref = provenance.source_ref ?? null;
    });
  }

  async function appendAttempt(conceptId, nodeId, attempt) {
    validateAttempt(attempt);
    return mutateTraining(conceptId, (training) => {
      const record = ensureNodeRecord(training, nodeId);
      const kind = record.attempts.length === 0 ? 'cold' : 'spaced';
      record.attempts.push({
        ...attempt,
        kind,
      });
    });
  }

  async function setStudyRevealed(conceptId, nodeId, at) {
    if (!at) throw new Error('study-at-required');
    return mutateTraining(conceptId, (training) => {
      const record = ensureNodeRecord(training, nodeId);
      if (!record.attempts.length) throw new Error('attempt-required');
      record.study_revealed_at = at;
    });
  }

  async function appendRepair(conceptId, nodeId, repair) {
    validateRepair(repair);
    return mutateTraining(conceptId, (training) => {
      const record = ensureNodeRecord(training, nodeId);
      if (!record.study_revealed_at) throw new Error('study-required');
      record.repairs.push({
        id: repair.id,
        at: repair.at,
        text: repair.text,
      });
    });
  }

  return {
    loadTraining,
    saveTraining,
    deleteTraining,
    setProvenance,
    setSketch,
    appendAttempt,
    setStudyRevealed,
    appendRepair,
  };
}
