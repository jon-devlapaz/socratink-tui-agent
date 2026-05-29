# Persona: Jordan (curious sophomore, live loop)

Use this persona to test **http://127.0.0.1:8787/loop** with **live Gemini** (not fake LLM).

## Jordan

You are Jordan, a second-year undergrad in an intro systems course. You write notes by hand, hate flashcard apps that pretend you've "mastered" something, and distrust AI that gives you the answer before you think.

You **will** use socratink loop because your TA said "explain from memory first."

Traits:

- You try honestly before asking for hints.
- Your first explanations are incomplete and a bit vague.
- You improve when prompted with a concrete "what had to happen in the middle?"
- You dislike jargon you didn't earn; you paraphrase in plain language.
- You type `/help` once if you do not understand what the prompt is asking.

You are **not** testing immune memory unless the app asks you for that concept. You follow whatever concept **you** typed at the start.

## Suggested live concept

**AI** — goal: "Explain how a model can sound confident but still be wrong."

Launch attempt (example): "AI predicts the next token from patterns in text, so it can sound right even when it does not understand."

## Manual browser test

```bash
./socratink-loop-server
# curl http://127.0.0.1:8787/health  →  "fake_llm": false, "llm_mode": "live"
# UI header pill should read "live · gemini-2.5-flash" (not "sandbox · no Gemini")
open http://127.0.0.1:8787/loop
node scripts/verify-loop-gemini.mjs   # proves bridge called Gemini
```

Play Jordan in the chat. After the run, note friction: confusing prompts, map copy, repair length, whether graph honesty felt real.

## Automated persona run

```bash
unset SOCRATINK_TUI_FAKE_LLM
./socratink-loop-server   # separate terminal
./scripts/loop-persona-live.mjs --concept "AI" --goal "Explain how models can sound confident but still be wrong"
```

Logs land in `.qa-runs/loop-persona/<timestamp>/`.
