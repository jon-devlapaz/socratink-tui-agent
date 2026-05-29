#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const WORKSPACE_ROOT = process.cwd();
const CASES_PATH = path.join(WORKSPACE_ROOT, 'learning_cases/cases.jsonl');

function usage() {
  return [
    'Usage: ./socratink-harness replay',
    '',
    'Replays promoted Socratink TUI learning cases against saved traces.',
  ].join('\n');
}

async function loadCases() {
  const raw = await fs.readFile(CASES_PATH, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => JSON.parse(line));
}

async function loadSession(caseRecord) {
  if (!caseRecord.session_log) {
    throw new Error(`${caseRecord.case_id}: session_log-required`);
  }
  const sessionPath = path.join(WORKSPACE_ROOT, caseRecord.session_log);
  return JSON.parse(await fs.readFile(sessionPath, 'utf8'));
}

function getFirstNodeId(session, caseId) {
  const nodeId = session?.route?.first_node?.id;
  if (!nodeId) throw new Error(`${caseId}: first-node-id-required`);
  return nodeId;
}

function check(condition, message, failures) {
  if (!condition) failures.push(message);
}

function replayCase(caseRecord, session) {
  const failures = [];
  const invariants = caseRecord.expected_invariants || {};
  const firstNodeId = getFirstNodeId(session, caseRecord.case_id);
  const eventOrder = Array.isArray(session.events)
    ? session.events.map((event) => event.type)
    : [];
  const finalNode = session.derived?.at(-1)?.nodes?.[firstNodeId] || {};
  const eventsByType = new Map((session.events || []).map((event) => [event.type, event]));
  const llmStages = new Set((session.llm_calls || []).map((call) => call.stage));
  const spacedEvent = eventsByType.get('spaced_redrill') || {};
  const coldEvent = eventsByType.get('cold_attempt') || {};
  const hasEvidenceHold = Array.isArray(session.evidence_holds) && session.evidence_holds.length > 0;

  check(
    JSON.stringify(eventOrder) === JSON.stringify(invariants.event_order || []),
    `event order mismatch: ${eventOrder.join(' -> ')}`,
    failures,
  );
  check(
    finalNode.state === invariants.final_node_state,
    `final state mismatch: expected ${invariants.final_node_state}, got ${finalNode.state}`,
    failures,
  );
  if (invariants.cold_evaluator_classification) {
    check(
      coldEvent?.evaluation?.classification === invariants.cold_evaluator_classification,
      (
        `cold evaluator mismatch: expected ${invariants.cold_evaluator_classification}, ` +
        `got ${coldEvent?.evaluation?.classification}`
      ),
      failures,
    );
  }
  if (invariants.spaced_evaluator_classification) {
    check(
      spacedEvent?.evaluation?.classification === invariants.spaced_evaluator_classification,
      (
        `spaced evaluator mismatch: expected ${invariants.spaced_evaluator_classification}, ` +
        `got ${spacedEvent?.evaluation?.classification}`
      ),
      failures,
    );
  }
  if (Object.hasOwn(invariants, 'evidence_hold_required')) {
    check(
      hasEvidenceHold === Boolean(invariants.evidence_hold_required),
      `evidence hold mismatch: expected ${Boolean(invariants.evidence_hold_required)}, got ${hasEvidenceHold}`,
      failures,
    );
  }
  if (Object.hasOwn(invariants, 'repair_count')) {
    check(
      finalNode.repair_count === invariants.repair_count,
      `repair count mismatch: expected ${invariants.repair_count}, got ${finalNode.repair_count}`,
      failures,
    );
  }
  if (Object.hasOwn(invariants, 'repair_dialogue_turn_count')) {
    const dialogueTurns = (session.events || []).filter((event) => event.type === 'repair_dialogue_turn');
    check(
      dialogueTurns.length === invariants.repair_dialogue_turn_count,
      `repair dialogue count mismatch: expected ${invariants.repair_dialogue_turn_count}, got ${dialogueTurns.length}`,
      failures,
    );
    if (dialogueTurns.length) {
      check(
        dialogueTurns[0].bridge_ready === invariants.first_repair_dialogue_bridge_ready,
        'first repair dialogue bridge readiness mismatch',
        failures,
      );
      check(
        dialogueTurns.at(-1).bridge_ready === invariants.last_repair_dialogue_bridge_ready,
        'last repair dialogue bridge readiness mismatch',
        failures,
      );
      check(
        dialogueTurns.every((turn) => turn.graph_neutral === true && turn.score_eligible === false),
        'repair dialogue turns must stay graph-neutral and score-ineligible',
        failures,
      );
    }
  }
  if (invariants.post_bridge_transfer_check_required) {
    const transferEvent = eventsByType.get('post_bridge_transfer_check');
    check(
      transferEvent?.graph_neutral === true,
      'post-bridge transfer check missing or not graph-neutral',
      failures,
    );
  }
  if (invariants.recovery_events_graph_neutral) {
    const recoveryEvents = (session.events || []).filter((event) =>
      event.type.startsWith('repair_recovery'),
    );
    check(
      recoveryEvents.length > 0,
      'recovery events required but missing',
      failures,
    );
    check(
      recoveryEvents.every((event) => event.graph_neutral === true),
      'recovery events must stay graph-neutral',
      failures,
    );
  }
  if (Object.hasOwn(invariants, 'repair_recovery_turn_count')) {
    const recoveryTurns = (session.events || []).filter(
      (event) => event.type === 'repair_recovery_turn',
    );
    check(
      recoveryTurns.length === invariants.repair_recovery_turn_count,
      (
        `repair recovery turn count mismatch: expected ${invariants.repair_recovery_turn_count}, ` +
        `got ${recoveryTurns.length}`
      ),
      failures,
    );
    check(
      recoveryTurns.every((turn) => turn.score_eligible === false),
      'repair recovery turns must be score-ineligible',
      failures,
    );
  }
  if (invariants.recovery_closed_outcome) {
    const closedEvent = (session.events || []).findLast(
      (event) => event.type === 'repair_recovery_closed',
    );
    check(
      Boolean(closedEvent),
      'repair recovery closed event missing',
      failures,
    );
    check(
      closedEvent?.outcome === invariants.recovery_closed_outcome,
      (
        `repair recovery outcome mismatch: expected ${invariants.recovery_closed_outcome}, ` +
        `got ${closedEvent?.outcome}`
      ),
      failures,
    );
  }
  if (Array.isArray(invariants.forbidden_recovery_outcomes)) {
    const recoveryOutcomes = (session.events || [])
      .filter((event) => event.type === 'repair_recovery_closed')
      .map((event) => event.outcome);
    for (const forbiddenOutcome of invariants.forbidden_recovery_outcomes) {
      check(
        !recoveryOutcomes.includes(forbiddenOutcome),
        `forbidden recovery outcome present: ${forbiddenOutcome}`,
        failures,
      );
    }
  }
  for (const forbiddenEvent of invariants.forbidden_events || []) {
    check(
      !eventOrder.includes(forbiddenEvent),
      `forbidden event present: ${forbiddenEvent}`,
      failures,
    );
  }
  for (const forbiddenStage of invariants.forbidden_llm_stages || []) {
    check(
      !llmStages.has(forbiddenStage),
      `forbidden llm stage present: ${forbiddenStage}`,
      failures,
    );
  }
  check(
    invariants.truth_source === 'training_derivation',
    `truth source mismatch: expected training_derivation, got ${invariants.truth_source}`,
    failures,
  );

  return {
    case_id: caseRecord.case_id,
    failures,
    facts: {
      final_state: finalNode.state,
      cold_evaluator: coldEvent?.evaluation?.classification || null,
      spaced_evaluator: spacedEvent?.evaluation?.classification || null,
      evidence_hold: hasEvidenceHold ? 'present' : 'absent',
      truth_source: invariants.truth_source,
    },
  };
}

function printReport(results) {
  const caseWord = results.length === 1 ? 'case' : 'cases';
  console.log('Socratink Harness');
  console.log(`${results.length} ${caseWord}`);
  console.log('');

  results.forEach((result) => {
    if (result.failures.length) {
      console.log(`FAIL ${result.case_id}`);
      result.failures.forEach((failure) => console.log(`  ${failure}`));
      return;
    }
    console.log(`PASS ${result.case_id}`);
    console.log('  event order ok');
    console.log(`  final state: ${result.facts.final_state}`);
    if (result.facts.cold_evaluator) console.log(`  cold evaluator: ${result.facts.cold_evaluator}`);
    if (result.facts.spaced_evaluator) console.log(`  evaluator: ${result.facts.spaced_evaluator}`);
    console.log(`  evidence hold: ${result.facts.evidence_hold}`);
    console.log(`  truth source: ${result.facts.truth_source}`);
  });
}

async function main() {
  const command = process.argv[2];
  if (command !== 'replay') {
    console.log(usage());
    process.exitCode = command ? 2 : 0;
    return;
  }
  const cases = await loadCases();
  const results = [];
  for (const caseRecord of cases) {
    const session = await loadSession(caseRecord);
    results.push(replayCase(caseRecord, session));
  }
  printReport(results);
  if (results.some((result) => result.failures.length)) {
    process.exitCode = 1;
  }
}

await main();
