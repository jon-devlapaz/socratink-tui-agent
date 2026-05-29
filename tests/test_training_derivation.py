"""Node-training derivation tests for the vendored graph-truth canon.

Ported from socratink-app; imports the vendored lib/canon/training-derive.js so
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
            f"Node training derivation test timed out after {TEST_NODE_TIMEOUT_SECONDS}s",
            pytrace=False,
        )


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_node_training_derivation_preserves_generation_before_recognition() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { deriveNodeTraining } from './lib/canon/training-derive.js';

        assert.deepEqual(
          deriveNodeTraining(null, { now: '2026-05-15T12:00:00.000Z' }),
          {
            state: null,
            next_action: 'cold_attempt',
            strongest_turn_text: null,
            gaps: [],
            solidify_unlocks_at: null,
            last_attempt_at: null,
          }
        );

        const weakCold = {
          attempts: [{
            id: 'a1',
            at: '2026-05-15T10:00:00.000Z',
            user_text: 'Sodium rushes in because there is more outside.',
            classification: 'wrong_direction',
            gaps: [{ mechanism: 'voltage-gated sodium channels', correction: 'Channels open at threshold; the gradient does not open them.' }],
            grader_version: 'test',
          }],
          repairs: [],
        };

        const beforeStudy = deriveNodeTraining(weakCold, { now: '2026-05-15T12:00:00.000Z' });
        assert.equal(beforeStudy.state, 'needs repair');
        assert.equal(beforeStudy.next_action, 'study');
        assert.equal(beforeStudy.strongest_turn_text, weakCold.attempts[0].user_text);
        assert.deepEqual(beforeStudy.gaps, weakCold.attempts[0].gaps);

        const afterStudy = deriveNodeTraining(
          { ...weakCold, study_revealed_at: '2026-05-15T12:05:00.000Z' },
          { now: '2026-05-15T12:10:00.000Z' }
        );
        assert.equal(afterStudy.next_action, 'repair');

        const afterRepair = deriveNodeTraining(
          {
            ...weakCold,
            study_revealed_at: '2026-05-15T12:05:00.000Z',
            repairs: [{
              id: 'r1',
              at: '2026-05-15T12:15:00.000Z',
              text: 'Voltage-gated sodium channels open at threshold.',
            }],
          },
          { now: '2026-05-15T12:20:00.000Z' }
        );
        assert.equal(afterRepair.state, 'needs repair');
        assert.equal(afterRepair.next_action, 'repair');
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_node_training_derivation_requires_spaced_strong_evidence_to_solidify() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { deriveNodeTraining } from './lib/canon/training-derive.js';

        const strongCold = {
          attempts: [{
            id: 'a1',
            at: '2026-05-15T10:00:00.000Z',
            user_text: 'Threshold opens voltage-gated sodium channels, causing depolarization.',
            classification: 'strong',
            gaps: [],
            grader_version: 'test',
          }],
          study_revealed_at: '2026-05-15T10:05:00.000Z',
          repairs: [],
        };

        const waiting = deriveNodeTraining(strongCold, { now: '2026-05-15T20:00:00.000Z' });
        assert.equal(waiting.state, 'primed');
        assert.equal(waiting.next_action, 'review');
        assert.equal(waiting.solidify_unlocks_at, '2026-05-16T04:00:00.000Z');

        const ready = deriveNodeTraining(strongCold, { now: '2026-05-16T05:00:00.000Z' });
        assert.equal(ready.state, 'primed');
        assert.equal(ready.next_action, 'spaced_attempt');
        assert.equal(ready.solidify_unlocks_at, null);

        const unspacedSecondStrong = deriveNodeTraining({
          ...strongCold,
          attempts: [
            ...strongCold.attempts,
            {
              id: 'a2',
              at: '2026-05-15T20:00:00.000Z',
              user_text: 'At threshold sodium channels open, then potassium channels repolarize the membrane.',
              classification: 'strong',
              gaps: [],
              grader_version: 'test',
            },
          ],
        }, { now: '2026-05-15T20:01:00.000Z' });
        assert.equal(unspacedSecondStrong.state, 'primed');

        const spacedSecondStrong = deriveNodeTraining({
          ...strongCold,
          attempts: [
            ...strongCold.attempts,
            {
              id: 'a2',
              at: '2026-05-16T05:00:00.000Z',
              user_text: 'At threshold sodium channels open, then potassium channels repolarize the membrane.',
              classification: 'strong',
              gaps: [],
              grader_version: 'test',
            },
          ],
        }, { now: '2026-05-16T05:01:00.000Z' });
        assert.equal(spacedSecondStrong.state, 'solidified');
        assert.equal(spacedSecondStrong.next_action, null);
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_node_training_derivation_preserves_single_lapse_grace() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { deriveNodeTraining } from './lib/canon/training-derive.js';

        const strongCold = {
          id: 'a1',
          at: '2026-05-15T10:00:00.000Z',
          user_text: 'Strong first pass.',
          classification: 'strong',
          gaps: [],
          grader_version: 'test',
        };
        const firstLapse = {
          id: 'a2',
          at: '2026-05-16T06:00:00.000Z',
          user_text: 'Weak spaced pass.',
          classification: 'thin',
          gaps: [{ mechanism: 'cause', correction: 'Name the missing cause.' }],
          grader_version: 'test',
        };
        const secondLapse = {
          ...firstLapse,
          id: 'a3',
          at: '2026-05-17T06:00:00.000Z',
          user_text: 'Still weak.',
        };

        const singleLapse = deriveNodeTraining({
          attempts: [strongCold, firstLapse],
          study_revealed_at: '2026-05-15T10:05:00.000Z',
          repairs: [],
        }, { now: '2026-05-16T06:05:00.000Z' });
        assert.equal(singleLapse.state, 'primed');
        assert.equal(singleLapse.next_action, 'repair');

        const twoLapses = deriveNodeTraining({
          attempts: [strongCold, firstLapse, secondLapse],
          study_revealed_at: '2026-05-15T10:05:00.000Z',
          repairs: [],
        }, { now: '2026-05-17T06:05:00.000Z' });
        assert.equal(twoLapses.state, 'needs repair');
        assert.equal(twoLapses.next_action, 'repair');
        """
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
def test_concept_status_uses_weakest_link_without_stored_state() -> None:
    result = run_node_module(
        """
        import assert from 'node:assert/strict';
        import { deriveConceptStatus } from './lib/canon/training-derive.js';

        const status = deriveConceptStatus(
          {
            concept_id: 'concept-1',
            schema_version: 1,
            node_records: {
              n1: {
                attempts: [{
                  id: 'a1',
                  at: '2026-05-15T10:00:00.000Z',
                  user_text: 'strong first pass',
                  classification: 'strong',
                  gaps: [],
                  grader_version: 'test',
                }],
                study_revealed_at: '2026-05-15T10:05:00.000Z',
                repairs: [],
              },
              n2: {
                attempts: [{
                  id: 'a2',
                  at: '2026-05-15T10:00:00.000Z',
                  user_text: 'wrong mechanism',
                  classification: 'thin',
                  gaps: [{ mechanism: 'cause', correction: 'Name the mechanism.' }],
                  grader_version: 'test',
                }],
                repairs: [],
              },
            },
          },
          ['n1', 'n2', 'n3'],
          { now: '2026-05-15T12:00:00.000Z' }
        );

        assert.deepEqual(status.composition, {
          untested: 1,
          primed: 1,
          needs_repair: 1,
          solidified: 0,
          total: 3,
        });
        assert.equal(status.badge, 'needs repair');
        """
    )
    assert result.returncode == 0, result.stderr
