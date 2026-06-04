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

test("enrichAwaiting exposes substrate refinement seed in composer", () => {
  const awaiting = enrichAwaiting(
    { key: "substrate_refinement", label: "Substrate refinement: " },
    {
      composerCta: {
        label: "Add a starting link",
        text:
          "A safe preview lets the body notice a pattern.\n\n" +
          "Add one starting link in your own words.",
      },
    },
  );
  assert.equal(awaiting.ctaLabel, "Add a starting link");
  assert.match(awaiting.ctaText, /safe preview/i);
  assert.match(awaiting.ctaText, /starting link/i);
});

test("enrichAwaiting does not leak repair CTA into transfer or spaced prompts", () => {
  for (const key of ["continue", "gap_attempt", "spaced_attempt"]) {
    const awaiting = enrichAwaiting(
      { key, label: `${key}: ` },
      {
        composerCta: { label: "Fill the missing link", text: "Old repair prompt" },
        repairScaffold: { socratic_question: "Old repair prompt" },
      },
    );
    assert.equal(awaiting.ctaLabel, key);
    assert.doesNotMatch(String(awaiting.ctaText || ""), /Old repair prompt/);
    if (key === "continue" || key === "cmd") {
      assert.equal(awaiting.ctaText, null);
    } else {
      assert.match(awaiting.ctaText, /own words|Durability/i);
    }
  }
});

test("enrichAwaiting keeps idle command chrome out of composer CTA", () => {
  const awaiting = enrichAwaiting({ key: "cmd", label: "> " }, {});
  assert.equal(awaiting.ctaLabel, null);
  assert.equal(awaiting.ctaText, null);
});
