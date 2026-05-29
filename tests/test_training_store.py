"""Storage boundary tests for the vendored browser-local training store.

Ported from socratink-app; imports the vendored lib/canon/training-store.js so
the TUI's self-contained copy is exercised directly.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_NODE_TIMEOUT_SECONDS = 30


def run_node_module(script: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=TEST_NODE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        pytest.fail(
            f"Node training store test timed out after {TEST_NODE_TIMEOUT_SECONDS}s",
            pytrace=False,
        )


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_training_store_uses_async_separate_namespace_and_derives_attempt_kind() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { createTrainingStore } from './lib/canon/training-store.js';

        const writes = new Map();
        const storage = {
          getItem(key) { return writes.has(key) ? writes.get(key) : null; },
          setItem(key, value) { writes.set(key, value); },
          removeItem(key) { writes.delete(key); },
        };
        const store = createTrainingStore({ storage });

        const loading = store.loadTraining('concept-1');
        assert.equal(typeof loading.then, 'function', 'store API must stay async for Supabase swap');
        assert.equal(await loading, null);

        await store.setSketch('concept-1', {
          text: ' My first explanation.  ',
          at: '2026-05-15T09:00:00.000Z',
        });
        await store.appendAttempt('concept-1', 'n1', {
          id: 'a1',
          kind: 'spaced',
          at: '2026-05-15T10:00:00.000Z',
          user_text: '  Sodium rushes in because there is more outside.  ',
          classification: 'wrong_direction',
          gaps: [{ mechanism: 'voltage-gated sodium channels', correction: 'Channels open at threshold.' }],
          grader_version: 'test',
        });
        await store.appendAttempt('concept-1', 'n1', {
          id: 'a2',
          kind: 'cold',
          at: '2026-05-16T05:00:00.000Z',
          user_text: 'Voltage-gated sodium channels open at threshold.',
          classification: 'strong',
          gaps: [],
          grader_version: 'test',
        });

        assert.deepEqual([...writes.keys()], ['socratink:training:v1:concept-1']);
        const training = await store.loadTraining('concept-1');

        assert.equal(training.schema_version, 1);
        assert.deepEqual(training.sketch, {
          text: ' My first explanation.  ',
          at: '2026-05-15T09:00:00.000Z',
        });
        assert.equal(training.node_records.n1.attempts[0].kind, 'cold');
        assert.equal(training.node_records.n1.attempts[1].kind, 'spaced');
        assert.equal(training.node_records.n1.attempts[0].user_text, '  Sodium rushes in because there is more outside.  ');
        await store.deleteTraining('concept-1');
        assert.equal(await store.loadTraining('concept-1'), null);
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_training_store_persists_provenance_without_treating_sketch_as_attempt() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { createTrainingStore } from './lib/canon/training-store.js';

        const writes = new Map();
        const storage = {
          getItem(key) { return writes.has(key) ? writes.get(key) : null; },
          setItem(key, value) { writes.set(key, value); },
          removeItem(key) { writes.delete(key); },
        };
        const store = createTrainingStore({ storage });

        await store.setProvenance('source-less-concept', {
          source_mode: 'source_less',
          grounding: 'learner_sketch',
          source_ref: null,
        });
        await store.setSketch('source-less-concept', {
          text: 'I think vaccines train the immune system.',
          at: '2026-05-15T09:00:00.000Z',
        });

        const sourceLess = await store.loadTraining('source-less-concept');
        assert.equal(sourceLess.source_mode, 'source_less');
        assert.equal(sourceLess.grounding, 'learner_sketch');
        assert.deepEqual(sourceLess.source_ref, null);
        assert.deepEqual(sourceLess.node_records, {});

        await store.setProvenance('source-attached-concept', {
          source_mode: 'source_attached',
          grounding: 'source',
          source_ref: { type: 'url', url: 'https://example.test/source' },
        });

        const sourceAttached = await store.loadTraining('source-attached-concept');
        assert.equal(sourceAttached.source_mode, 'source_attached');
        assert.equal(sourceAttached.grounding, 'source');
        assert.deepEqual(sourceAttached.source_ref, {
          type: 'url',
          url: 'https://example.test/source',
        });
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_training_store_enforces_generation_study_repair_order() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { createTrainingStore } from './lib/canon/training-store.js';

        const writes = new Map();
        const storage = {
          getItem(key) { return writes.has(key) ? writes.get(key) : null; },
          setItem(key, value) { writes.set(key, value); },
          removeItem(key) { writes.delete(key); },
        };
        const store = createTrainingStore({ storage });

        await assert.rejects(
          store.setStudyRevealed('concept-1', 'n1', '2026-05-15T10:05:00.000Z'),
          /attempt-required/
        );
        await assert.rejects(
          store.appendRepair('concept-1', 'n1', {
            id: 'r1',
            at: '2026-05-15T10:10:00.000Z',
            text: 'repair before study',
          }),
          /study-required/
        );

        await store.appendAttempt('concept-1', 'n1', {
          id: 'a1',
          at: '2026-05-15T10:00:00.000Z',
          user_text: 'I think it is sodium.',
          classification: 'thin',
          gaps: [{ mechanism: 'gating', correction: 'Name what opens the channel.' }],
          grader_version: 'test',
        });
        await store.setStudyRevealed('concept-1', 'n1', '2026-05-15T10:05:00.000Z');
        await store.appendRepair('concept-1', 'n1', {
          id: 'r1',
          at: '2026-05-15T10:10:00.000Z',
          text: 'Voltage-gated channels open at threshold.',
        });
        await store.appendRepair('concept-1', 'n1', {
          id: 'r2',
          at: '2026-05-15T10:15:00.000Z',
          text: 'Then potassium channels repolarize the membrane.',
        });

        const training = await store.loadTraining('concept-1');
        assert.equal(training.node_records.n1.study_revealed_at, '2026-05-15T10:05:00.000Z');
        assert.deepEqual(
          training.node_records.n1.repairs.map((repair) => repair.text),
          [
            'Voltage-gated channels open at threshold.',
            'Then potassium channels repolarize the membrane.',
          ]
        );
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_training_store_rejects_non_substantive_attempts_without_mutating_storage() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { createTrainingStore } from './lib/canon/training-store.js';

        const writes = new Map();
        const storage = {
          getItem(key) { return writes.has(key) ? writes.get(key) : null; },
          setItem(key, value) { writes.set(key, value); },
          removeItem(key) { writes.delete(key); },
        };
        const store = createTrainingStore({ storage });

        await assert.rejects(
          store.appendAttempt('concept-1', 'n1', {
            id: 'a1',
            at: '2026-05-15T10:00:00.000Z',
            user_text: '   ',
            classification: 'thin',
            gaps: [{ mechanism: 'cause', correction: 'Name the cause.' }],
            grader_version: 'test',
          }),
          /user-text-required/
        );

        assert.equal(await store.loadTraining('concept-1'), null);
        assert.equal(writes.size, 0);
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_training_store_ignores_corrupt_persisted_json() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { createTrainingStore } from './lib/canon/training-store.js';

        const writes = new Map([
          ['socratink:training:v1:concept-1', '{'],
        ]);
        const storage = {
          getItem(key) { return writes.has(key) ? writes.get(key) : null; },
          setItem(key, value) { writes.set(key, value); },
          removeItem(key) { writes.delete(key); },
        };
        const store = createTrainingStore({ storage });

        assert.equal(await store.loadTraining('concept-1'), null);
        await store.appendAttempt('concept-1', 'n1', {
          id: 'a1',
          at: '2026-05-15T10:00:00.000Z',
          user_text: 'A fresh attempt after corrupt storage.',
          classification: 'thin',
          gaps: [],
          grader_version: 'test',
        });

        const training = await store.loadTraining('concept-1');
        assert.equal(training.node_records.n1.attempts[0].user_text, 'A fresh attempt after corrupt storage.');
        """
    )
    assert result.returncode == 0, result.stderr
