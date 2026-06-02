import test from "node:test";
import assert from "node:assert/strict";
import { enrichAwaiting } from "../../lib/loop-server/awaiting-cta.mjs";

test("enrichAwaiting attaches cold attempt question to composer", () => {
  const awaiting = enrichAwaiting(
    { key: "cold_attempt", label: "Cold attempt: " },
    {
      firstNode: { learner_prompt: "Explain lift in your own words." },
    },
  );
  assert.equal(awaiting.ctaLabel, "Answer from memory");
  assert.match(awaiting.ctaText, /lift/i);
});

test("enrichAwaiting prefers ctx.composerCta when set", () => {
  const awaiting = enrichAwaiting(
    { key: "repair", label: "Repair: " },
    {
      composerCta: { label: "Continue", text: "What happens in the middle?" },
      repairScaffold: { socratic_question: "ignored" },
    },
  );
  assert.equal(awaiting.ctaLabel, "Continue");
  assert.equal(awaiting.ctaText, "What happens in the middle?");
});

test("enrichAwaiting does not leak repair CTA into transfer or spaced prompts", () => {
  for (const key of ["gap_attempt", "spaced_attempt", "cmd"]) {
    const awaiting = enrichAwaiting(
      { key, label: `${key}: ` },
      {
        composerCta: { label: "Fill the missing link", text: "Old repair prompt" },
        repairScaffold: { socratic_question: "Old repair prompt" },
      },
    );
    assert.equal(awaiting.ctaLabel, key);
    assert.equal(awaiting.ctaText, null);
  }
});
