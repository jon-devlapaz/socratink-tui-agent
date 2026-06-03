import test from "node:test";
import assert from "node:assert/strict";

import {
  LOOP_APP_VERSION,
  LOOP_APP_VERSION_DEFAULT,
} from "../../lib/loop-server/version.mjs";

test("LOOP_APP_VERSION_DEFAULT is canonical patch label", () => {
  assert.match(LOOP_APP_VERSION_DEFAULT, /^v0\.\d{2}$/);
  assert.equal(LOOP_APP_VERSION, LOOP_APP_VERSION_DEFAULT);
});
