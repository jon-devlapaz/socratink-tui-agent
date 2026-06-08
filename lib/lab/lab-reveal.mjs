import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function revealPathInOs(outDir) {
  const path = String(outDir || "").trim();
  if (!path || !fs.existsSync(path)) {
    throw new Error("Run folder not found on disk");
  }

  if (process.platform === "darwin") {
    await execFileAsync("open", [path]);
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("explorer", [path]);
    return;
  }
  await execFileAsync("xdg-open", [path]);
}
