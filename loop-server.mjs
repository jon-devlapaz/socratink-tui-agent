#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/lab/load-repo-env.mjs";
import { startLoopServer } from "./lib/loop-server/http-server.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
loadRepoEnv(repoRoot);
startLoopServer();
