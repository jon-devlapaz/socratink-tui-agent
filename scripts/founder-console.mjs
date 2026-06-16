#!/usr/bin/env node
import process from "node:process";
import {
  ensureLoopServer,
  parseFounderArgs,
  runFounderBatch,
  usage,
} from "../lib/lab/founder-console.mjs";

async function main() {
  const options = parseFounderArgs(process.argv.slice(2));
  if (options.command === "help") {
    console.log(usage());
    return;
  }

  if (options.command === "start") {
    const server = await ensureLoopServer({
      port: options.port,
      baseUrl: options.baseUrl,
      open: options.open,
    });
    console.log(
      `[founder-console] lab=${server.baseUrl}/lab reused=${server.reused ? "yes" : "no"}`,
    );
    if (server.child) {
      await new Promise((resolve) => server.child.on("exit", resolve));
    }
    return;
  }

  if (options.command === "run") {
    const result = await runFounderBatch(options);
    console.log(`[founder-console] wrote ${result.reportMdPath}`);
    console.log(`[founder-console] wrote ${result.reportJsonPath}`);
    console.log(`[founder-console] evidence=${result.report.evidence_status}`);
    console.log(`[founder-console] recommendation=${result.report.recommendation}`);
    if (result.server.child) {
      result.server.child.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
