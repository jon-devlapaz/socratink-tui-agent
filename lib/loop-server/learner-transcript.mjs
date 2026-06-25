function isSkippedLearnerLine(text, ctaText = "") {
  const t = String(text ?? "").trim();
  if (ctaText && t === ctaText) return true;
  if (!t) return true;
  if (/^\[(STARTING POINT|SUBSTRATE GATE|ROUTE|HYPOTHESIS MAP|COLD ATTEMPT|DELTA|SOCRATIC REPAIR DRILL|OWN-WORDS REPAIR|REPAIR DIALOGUE|MODEL BRIDGE|TRANSFER CHECK|SPACING|SPACED RE-DRILL)\]$/i.test(t)) return true;
  if (/^\[(Route LLM|Route Retry|LLM [^\]]+|Evidence)\]/i.test(t)) return true;
  if (/^(hypothesis map|Thesis:|Pillars:|Rooms:)/i.test(t)) return true;
  if (/^(Bridge readiness:|Spacing advanced:)/i.test(t)) return true;
  if (/^The learner\b/i.test(t)) return true;
  if (/^·\s+/.test(t)) return true;
  if (/^c\d+_s\d+\s+\[/.test(t)) return true;
  if (t.startsWith("[Question]")) return true;
  if (/^First question:\s*$/i.test(t)) return true;
  if (/^Generating Smallest actionable route\.\.\.$/i.test(t)) return true;
  return false;
}

export function filterLearnerTranscript(lines = [], ctaText = "") {
  const cta = String(ctaText ?? "").trim();
  return lines.filter((entry) => !isSkippedLearnerLine(entry?.text ?? entry, cta));
}
