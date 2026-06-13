import fs from "node:fs";
import path from "node:path";

const VERSION = "lab-dialogue-v1";
const MAX_TURNS_PER_RUN = 80;
const MAX_LINES_PER_TURN = 80;
const MAX_TEXT_CHARS = 1_200;

function compactText(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}...[truncated]`;
}

function compactLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => compactText(line?.text ?? line))
    .filter(Boolean)
    .slice(0, MAX_LINES_PER_TURN);
}

function compactTurn(turnRecord = {}, transcriptDelta = []) {
  return {
    n: turnRecord.n ?? null,
    phase: turnRecord.phase || null,
    awaiting: turnRecord.awaiting_key_before || null,
    kind: turnRecord.kind || null,
    student: compactText(turnRecord.input ?? turnRecord.display),
    lines: compactLines(transcriptDelta),
  };
}

export function emptyLabDialogue() {
  return {
    version: VERSION,
    runs: [],
  };
}

export function dialogueFromRunLog({ index = null, outDir = null, log = null } = {}) {
  const turns = Array.isArray(log?.turns) ? log.turns : [];
  return {
    index,
    out_dir: outDir,
    turn_count: turns.length,
    turns: turns
      .slice(0, MAX_TURNS_PER_RUN)
      .map((turn) => compactTurn(turn, turn.transcript_delta)),
  };
}

export function appendDialogueProgress(dialogue = emptyLabDialogue(), progress = {}) {
  const runIndex = Number.isFinite(Number(progress.activeRun))
    ? Number(progress.activeRun)
    : null;
  const dialogueTurn = progress.dialogueTurn || progress.dialogue_turn;
  if (!runIndex || !dialogueTurn?.turnRecord) return dialogue;

  const runs = Array.isArray(dialogue?.runs) ? dialogue.runs : [];
  const existing = runs.find((run) => run.index === runIndex);
  const nextTurn = compactTurn(
    dialogueTurn.turnRecord,
    dialogueTurn.transcript_delta || dialogueTurn.transcriptDelta,
  );
  const nextRuns = existing
    ? runs.map((run) => {
        if (run.index !== runIndex) return run;
        const priorTurns = Array.isArray(run.turns) ? run.turns : [];
        const withoutDuplicate = priorTurns.filter((turn) => turn.n !== nextTurn.n);
        const turns = [...withoutDuplicate, nextTurn]
          .sort((a, b) => Number(a.n || 0) - Number(b.n || 0))
          .slice(0, MAX_TURNS_PER_RUN);
        return { ...run, turn_count: turns.length, turns };
      })
    : [
        ...runs,
        {
          index: runIndex,
          out_dir: dialogueTurn.outDir || null,
          turn_count: 1,
          turns: [nextTurn],
        },
      ];
  return {
    version: VERSION,
    runs: nextRuns.sort((a, b) => Number(a.index || 0) - Number(b.index || 0)),
  };
}

function readRunLog(outDir) {
  if (!outDir) return null;
  const filePath = path.join(outDir, "persona-run.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function dialogueFromReport(report = {}) {
  const runs = Array.isArray(report?.runs) ? report.runs : [];
  return {
    version: VERSION,
    runs: runs.map((run) => {
      const outDir = run.out_dir || run.outDir || null;
      const log = run.log || readRunLog(outDir);
      if (!log) {
        return {
          index: run.index ?? null,
          out_dir: outDir,
          turn_count: 0,
          turns: [],
        };
      }
      return dialogueFromRunLog({
        index: run.index ?? null,
        outDir,
        log,
      });
    }),
  };
}

export const LAB_DIALOGUE_VERSION = VERSION;
