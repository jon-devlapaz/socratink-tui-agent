import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

test("bootstrap-python warns on old interpreter and installs requirements into venv", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "socratink-bootstrap-python-"));
  await mkdir(path.join(root, "scripts"));
  await cp(path.join(WORKSPACE_ROOT, "scripts", "bootstrap-python.sh"), path.join(root, "scripts", "bootstrap-python.sh"), {
    recursive: true,
  });
  await writeFile(path.join(root, "requirements-dev.txt"), "# test requirements\n", "utf8");

  const log = path.join(root, "python.log");
  const fakePython = path.join(root, "fake-python");
  await writeFile(
    fakePython,
    `#!/bin/sh
echo "$@" >> "${log}"
if [ "$1" = "-c" ]; then
  echo "3.11"
  exit 0
fi
if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then
  mkdir -p "$3/bin"
  printf '%s\\n' 'export PATH="$PWD/.venv/bin:$PATH"' > "$3/bin/activate"
  cat > "$3/bin/python" <<'PY'
#!/bin/sh
echo "$@" >> "${log}"
if [ "$1" = "-m" ] && [ "$2" = "pip" ] && [ "$3" = "--version" ]; then
  exit 1
fi
exit 0
PY
  chmod +x "$3/bin/python"
  exit 0
fi
exit 0
`,
    "utf8",
  );
  await chmod(fakePython, 0o755);
  await chmod(path.join(root, "scripts", "bootstrap-python.sh"), 0o755);

  const result = spawnSync("bash", ["scripts/bootstrap-python.sh"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHON_BOOTSTRAP: fakePython },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /WARN: .* is 3\.11; >=3\.12 recommended/);
  assert.match(result.stdout, /\[bootstrap-python\] OK \(\.venv ready\)/);

  const calls = await readFile(log, "utf8");
  assert.match(calls, /-m venv \.venv/);
  assert.match(calls, /-m ensurepip --upgrade/);
  assert.match(calls, /-m pip install --upgrade pip/);
  assert.match(calls, /-m pip install -r requirements-dev\.txt/);
});
