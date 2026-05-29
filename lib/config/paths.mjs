import fs from "node:fs";
import path from "node:path";

export function resolveTuiPaths(cwd = process.cwd()) {
  const workspaceRoot = cwd;
  const vendorPythonRoot = path.join(workspaceRoot, "vendor/python");
  return {
    workspaceRoot,
    vendorPythonRoot,
    bridgePath: path.join(workspaceRoot, "bridge.py"),
    python: process.env.PYTHON || path.join(workspaceRoot, ".venv/bin/python"),
    trainingStorePath: path.join(workspaceRoot, "lib/canon/training-store.js"),
    trainingDerivePath: path.join(workspaceRoot, "lib/canon/training-derive.js"),
  };
}

/**
 * Fail closed at startup with actionable errors when a vendored dependency is
 * missing, instead of surfacing opaque ENOENT / unresolved-module failures
 * mid-run. Throws an Error whose message names the missing path and the fix.
 */
export function preflightTuiPaths(paths) {
  const checks = [
    {
      ok: fs.existsSync(paths.python),
      message:
        `Python interpreter not found at ${paths.python}. Create the venv ` +
        `(./scripts/bootstrap-python.sh), or set PYTHON to a usable interpreter.`,
    },
    {
      ok: fs.existsSync(paths.bridgePath),
      message: `bridge.py not found at ${paths.bridgePath}.`,
    },
    {
      ok: fs.existsSync(path.join(paths.vendorPythonRoot, "ai_service.py")),
      message:
        `vendored Python seam not found at ${paths.vendorPythonRoot}. The bridge ` +
        `requires vendor/python/ (ai_service.py, llm/, models/, app_prompts/). ` +
        `Run ./scripts/sync-canon-from-app.sh if it is missing.`,
    },
    {
      ok: fs.existsSync(paths.trainingStorePath),
      message:
        `training-store.js not found at ${paths.trainingStorePath}. The vendored ` +
        `graph-truth canon is missing; run ./scripts/sync-canon-from-app.sh.`,
    },
    {
      ok: fs.existsSync(paths.trainingDerivePath),
      message:
        `training-derive.js not found at ${paths.trainingDerivePath}. The vendored ` +
        `graph-truth canon is missing; run ./scripts/sync-canon-from-app.sh.`,
    },
  ];
  const failures = checks.filter((check) => !check.ok).map((c) => c.message);
  if (failures.length) {
    throw new Error(
      `Socratink TUI preflight failed:\n  - ${failures.join("\n  - ")}`,
    );
  }
}
