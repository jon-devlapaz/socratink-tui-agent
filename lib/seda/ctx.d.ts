/**
 * The `ctx` blackboard: in-flight working state shared across SEDA phase
 * handlers, parallel to the append-only `events[]` fact chain.
 *
 * Closed-loop note (see HARNESS.md / plan "Principle 2"): `events[]` is the
 * authoritative routing/truth record that `nextPhase` and replay read. `ctx` is
 * mutable convenience state for the current process only. A field is safe to
 * keep ctx-only if it is telemetry/infra OR fully reconstructable from
 * `events[]`. Phase-critical state that is NOT reconstructable is a closed-loop
 * gap — see `repairState`.
 *
 * Each field below names its writer handler(s) and reader(s) so the control
 * inputs are traceable. Handler paths are under `lib/seda/handlers/`.
 *
 * This file is documentation/editor-support only (the project is plain ESM with
 * no tsc build step). `app.mjs` annotates the live object via JSDoc `@type`.
 */

/** The first node of a provisional route — the single drillable subnode. */
export interface FirstNode {
  id: string;
  kc_id?: string;
  label: string;
  mechanism: string;
  evidence_goal?: string;
  blank_hint?: string;
  learner_prompt?: string;
}

/** Provisional route map + retry telemetry produced by the route handler. */
export interface RouteState {
  provisional_map: unknown;
  map_displayed?: unknown;
  retry_count?: number;
  retry_reasons?: string[];
}

/**
 * Per-repair working state. LOOP-CRITICAL and the one field NOT reconstructable
 * from `events[]` on its own — it is initialized in `delta`, mutated each turn
 * in `repair-dialogue`, and set to `null` on exit. `escalation_level` in
 * particular drives prompt selection but was historically invisible to the log.
 * It is now mirrored onto each `repair_dialogue_turn` / `repair_hint_requested`
 * event via `repairStateSnapshot()`, so a session is replayable mid-repair.
 */
export interface RepairState {
  turnIndex: number;
  escalationLevel: number;
  isFirstTurn: boolean;
  queuedPrompt: string | null;
  uncertaintyRecoveryCount: number;
  hintCount: number;
  lastHintLevel: number;
  ladderPolicyVersion: string;
}

export interface SedaCtx {
  // --- Session inputs (writer: ignition; also idle for re-entry) ---
  /** writer: ignition, idle. readers: route, app.mjs final write. */
  concept: string;
  /** writer: ignition. readers: every store call + app.mjs final write. */
  conceptId: string;
  /** writer: ignition. readers: route, app.mjs final write. */
  learnerGoal: string | null;
  /** writer: ignition. reader: route. */
  launchAttempt: string | null;

  // --- Loop-critical working state (reconstructable from events[] unless noted) ---
  /** writer: route. readers: nearly all handlers (label/mechanism/ids). */
  firstNode: FirstNode | null;
  /** writer: route. readers: summarizeTraining() in every derived push. */
  nodeIds: string[];
  /** writer: route. readers: cold-attempt, post-bridge-transfer, spaced-redrill. */
  route: RouteState | null;
  /** writer: cold-attempt. reader: delta (gap_description). */
  coldEval: Record<string, unknown> | null;
  /** writer: cold-attempt. reader: delta. */
  coldAttemptText: string;
  /** writer: cold-attempt, delta. reader: delta. Cold attempt produced no schema. */
  zeroSchemaCold: boolean;
  /** writer: cold-attempt. reader: delta. Triggers misconception_counter scaffold. */
  isMisconception: boolean;
  /** writer: delta. readers: repair-dialogue, repair-recovery, post-bridge-transfer, repair-abandoned. */
  repairScaffold: Record<string, unknown> | null;
  /** writer: delta. readers: repair-dialogue, repair-recovery (gap_id on events). */
  gapId: string;
  /** writer: delta (init), repair-dialogue (mutate / null on exit). reader: repair-dialogue. See RepairState. */
  repairState: RepairState | null;

  // --- Accumulators / telemetry ---
  /** writer: app.mjs init + spaced-redrill (push). reader: app.mjs final write (evidence_holds). */
  evidenceHolds: unknown[];

  // --- Infra: I/O, config, agent wiring (not loop state) ---
  /** writer: app.mjs. readers: repair-dialogue, post-bridge-transfer, idle. Fake-LLM / fixture driver. */
  scripted: Record<string, unknown> | null;
  /** writer: app.mjs. readers: every handler via agentCall(ctx.agentLookup, ...). */
  agentLookup: unknown;
  /** writer: app.mjs. reader: app.mjs final write (architecture metadata); carried on ctx for completeness. */
  agentContracts: Record<string, unknown>;
  /** writer: app.mjs. readers: every handler via ctx.section(...) for UI section headers. */
  section: (kind: string, title: string) => string;
  /** writer: app.mjs. reader: route (map legend formatter). */
  colorEnabled: boolean;
  /** writer: app.mjs. reader: app.mjs final write (session.json path); carried on ctx for completeness. */
  logDir: string;
}
