import fs from "node:fs";
import path from "node:path";

export const LAB_PROGRESS_FILENAME = "lab-progress.json";
export const LAB_CANCEL_FILENAME = ".cancel";

export function labProgressPath(outDir) {
  return path.join(outDir, LAB_PROGRESS_FILENAME);
}

export function cancelFlagPath(outDir) {
  return path.join(outDir, LAB_CANCEL_FILENAME);
}

export function readLabProgress(outDir) {
  const filePath = labProgressPath(outDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeLabProgress(outDir, partial) {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = labProgressPath(outDir);
  const current = readLabProgress(outDir) || {};
  const next = {
    ...current,
    ...partial,
    updatedAt: Date.now(),
  };
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2));
  fs.renameSync(tmpPath, filePath);
  return next;
}

export function requestLabCancel(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(cancelFlagPath(outDir), "");
}

export function isLabCancelRequested(outDir) {
  return fs.existsSync(cancelFlagPath(outDir));
}
