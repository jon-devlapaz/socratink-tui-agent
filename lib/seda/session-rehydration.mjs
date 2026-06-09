import { nextPhase } from "./next-phase.mjs";
import { createSessionKernel } from "./session-kernel.mjs";
import {
  REPAIR_AT,
  SPACED_AT,
  STUDY_AT,
  TRAINING_NOW,
  UNCERTAINTY_LADDER_POLICY_VERSION,
} from "./constants.mjs";
import { classifyForStore, gapsForStore } from "./cold-gating.mjs";
import { eventDefinition } from "./event-facts.mjs";

export class CannotRehydrateSession extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CannotRehydrateSession";
    this.code = "CannotRehydrateSession";
    this.details = details;
  }
}

export async function createRehydratedSessionKernel({
  createTrainingStore,
  bridge,
  agentContracts,
  agentLookup,
  section,
  events,
  scripted = null,
  colorEnabled = false,
  logDir = null,
}) {
  if (!Array.isArray(events)) {
    throw new CannotRehydrateSession("events array required");
  }
  const kernel = createSessionKernel({
    createTrainingStore,
    bridge,
    agentContracts,
    agentLookup,
    section,
    scripted,
    colorEnabled,
    logDir,
    events,
  });
  reconstructCtxFromEvents(kernel.ctx, kernel.events);
  await rebuildTrainingStoreFromEvents(kernel.store, kernel.events, kernel.ctx);
  return {
    ...kernel,
    phase: nextPhase(kernel.events),
  };
}

export function reconstructCtxFromEvents(ctx, events) {
  for (const event of events) {
    switch (event.type) {
      case "idle_new_concept":
        ctx.concept = event.concept || ctx.concept;
        break;
      case "learner_goal_set":
        ctx.learnerGoal = event.learner_goal ?? "";
        break;
      case "launch_attempt":
        requirePersistedFields(event);
        ctx.concept = event.concept;
        ctx.conceptId = event.concept_id;
        ctx.learnerGoal = event.learner_goal ?? null;
        ctx.launchAttempt = event.text;
        break;
      case "route_generated":
        requirePersistedFields(event);
        ctx.firstNode = event.first_node;
        ctx.nodeIds = event.node_ids;
        ctx.route = {
          provisional_map: event.provisional_map,
          first_node: event.first_node,
          map_displayed: event.map_displayed,
          substrate_adequacy: event.substrate_adequacy,
          retry_count: event.retry_count,
          retry_reasons: event.retry_reasons,
        };
        ctx.composerCta = {
          label: "First question",
          text: event.first_node?.learner_prompt || "",
        };
        break;
      case "cold_help_turn":
        ctx.coldAttemptText = event.text || ctx.coldAttemptText;
        ctx.coldEval = {
          answer_mode: event.answer_mode,
          classification: event.classification,
          agent_response: event.agent_response,
          score_eligible: false,
        };
        break;
      case "cold_support_exhausted":
        ctx.zeroSchemaCold = true;
        break;
      case "cold_attempt":
        ctx.coldAttemptText = event.text || "";
        ctx.coldEval = event.evaluation || null;
        ctx.zeroSchemaCold = false;
        ctx.isMisconception =
          event.evaluation?.classification === "misconception";
        break;
      case "gap_identified":
        ctx.repairScaffold = event.repair_scaffold || null;
        ctx.gapId = event.gap_id || fallbackGapId(ctx.firstNode);
        ctx.repairState = initialRepairState();
        ctx.composerCta = {
          label: "Repair",
          text: ctx.repairScaffold?.socratic_question || event.prompt || "",
        };
        break;
      case "repair_hint_requested":
      case "repair_dialogue_turn":
        requirePersistedFields(event);
        ctx.repairState = repairStateFromTurn(event);
        if (event.bridge_ready) {
          ctx.repairState = null;
          ctx.composerCta = null;
        } else {
          ctx.composerCta = {
            label: "Try the missing link again",
            text:
              event.next_prompt ||
              ctx.repairState?.queuedPrompt ||
              ctx.repairScaffold?.socratic_question ||
              "",
          };
        }
        break;
      case "repair":
      case "model_bridge":
        ctx.repairState = null;
        ctx.composerCta = null;
        break;
      case "post_bridge_transfer_decision":
        requirePersistedFields(event);
        ctx.postBridgeTransfer = { runGap: Boolean(event.run_gap) };
        break;
      case "post_bridge_transfer_check":
      case "post_bridge_transfer_skipped":
        ctx.postBridgeTransfer = null;
        break;
      case "evidence_hold_recorded":
        requirePersistedFields(event);
        ctx.evidenceHolds.push({
          event: event.hold_event,
          state: event.state,
          reason: event.reason,
        });
        break;
      default:
        break;
    }
  }
  return ctx;
}

export async function rebuildTrainingStoreFromEvents(store, events, ctx) {
  if (!ctx.conceptId) return null;
  const training = {
    concept_id: ctx.conceptId,
    schema_version: 1,
    source_mode: "source_less",
    grounding: "learner_sketch",
    source_ref: null,
    sketch: ctx.launchAttempt
      ? {
          text: ctx.launchAttempt,
          at: TRAINING_NOW,
        }
      : null,
    node_records: {},
  };
  const nodeId = ctx.firstNode?.id || ctx.nodeIds?.[0] || null;
  const record = nodeId
    ? (training.node_records[nodeId] = { attempts: [], repairs: [] })
    : null;

  for (const event of events) {
    if (!record) break;
    if (event.type === "cold_attempt" && event.evaluation) {
      record.attempts.push({
        id: "cold-1",
        at: TRAINING_NOW,
        user_text: event.text,
        classification: classifyForStore(event.evaluation),
        gaps: gapsForStore(event.evaluation),
        grader_version: event.evaluation?.grader_version || "rehydrated",
        kind: "cold",
      });
    }
    if (event.type === "gap_identified" && record.attempts.length) {
      record.study_revealed_at = STUDY_AT;
    }
    if (event.type === "repair") {
      record.repairs.push({
        id: `repair-${record.repairs.length + 1}`,
        at: REPAIR_AT,
        text: event.text,
      });
    }
    if (event.type === "spaced_redrill" && event.evaluation) {
      record.attempts.push({
        id: "spaced-1",
        at: SPACED_AT,
        user_text: event.text,
        classification: classifyForStore(event.evaluation),
        gaps: gapsForStore(event.evaluation),
        grader_version: event.evaluation?.grader_version || "rehydrated",
        kind: "spaced",
      });
    }
  }

  await store.saveTraining(training);
  return store.loadTraining(ctx.conceptId);
}

function requireFields(event, fields) {
  const missing = fields.filter((field) => !(field in event));
  if (missing.length) {
    throw new CannotRehydrateSession(
      `${event.type} missing required persisted field(s): ${missing.join(", ")}`,
      { event_type: event.type, missing },
    );
  }
}

function requirePersistedFields(event) {
  requireFields(event, eventDefinition(event.type).required_fields);
}

function fallbackGapId(firstNode) {
  return firstNode?.id ? `gap-${firstNode.id}-1` : "";
}

function initialRepairState() {
  return {
    turnIndex: 0,
    escalationLevel: 0,
    isFirstTurn: true,
    queuedPrompt: null,
    uncertaintyRecoveryCount: 0,
    hintCount: 0,
    lastHintLevel: 0,
    ladderPolicyVersion: UNCERTAINTY_LADDER_POLICY_VERSION,
  };
}

function repairStateFromTurn(event) {
  const snapshot = event.repair_state || {};
  return {
    turnIndex: event.turn_index || snapshot.turn_index || 0,
    escalationLevel: nextEscalationLevel(event, snapshot),
    isFirstTurn: false,
    queuedPrompt: event.next_prompt || null,
    uncertaintyRecoveryCount:
      snapshot.uncertainty_recovery_count || event.ladder_step || 0,
    hintCount: snapshot.hint_count || event.hint_count || 0,
    lastHintLevel: snapshot.last_hint_level || event.hint_level || 0,
    ladderPolicyVersion:
      snapshot.ladder_policy_version ||
      event.ladder_policy_version ||
      UNCERTAINTY_LADDER_POLICY_VERSION,
  };
}

function nextEscalationLevel(event, snapshot) {
  const level = snapshot.escalation_level || 0;
  if (event.next_dialogue_action === "escalate") return Math.max(level, 1);
  return level;
}
