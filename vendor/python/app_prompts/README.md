# app_prompts/

Production Gemini prompt assets. Versioned plain-text/markdown files
that the LLM pipeline loads at runtime from this directory. Bundled with
the Vercel serverless function deployment.

## Files

| File | Runtime role | What it does |
| :--- | :--- | :--- |
| `extract-system-v1.txt` | Source extraction | Turns raw source material into a structured `ProvisionalMap`. The schema this prompt produces matches `models.ProvisionalMap`. |
| `generate-smallest-route-system-v1.txt` | Route drafting | Generates a minimal traversal path through the map for the first drill session, including `learner_scaffold` on source-less smallest-route subnodes and optional `learner_goal` relevance framing. |
| `drill-system-v1.md` | Reconstruction drill | The Socratic drill agent. It turns material into reconstruction targets, uses learner attempts to expose repairable gaps, and classifies reconstruction attempts for the app to record only from reconstruction under the right conditions. The drill route runtime-appends a "Target Node (ANSWER KEY)" block, a "Learner Scaffold" block when present, optional Focused Repair Context for gap drills, the learner goal as relevance context, and the pruned map context. |
| `repair-reps-system-v1.md` | Repair reps | Post-drill spaced-repetition repair routine for nodes flagged `deep` or `misconception`. |

## Product Contract

Socratink prompts preserve Generation Before Recognition: model-generated
structure may shape the next task, but it must not replace learner generation.
Source material, learner goals, learner sketches, and learner scaffolds are context, not evidence.
Bloom/node-intent grammar stays internal; prompt assets may use it to aim a
reconstruction task, but learner-facing output should use plain task language.
Drill prompts classify reconstruction attempts for the app to record only when
the learner reconstructs from memory under the conditions required by the
training-state contract.

## Loading

`ai_service.py` resolves the directory once at module load:

```python
PROMPT_DIR = Path(__file__).parent / "app_prompts"
```

Then reads files as needed. There is no caching layer; file reads are
cheap and Vercel's filesystem is read-only at runtime.

## Footguns

- **Versioning is in the filename, not git history.** A prompt change that
  alters extraction output should ship as `extract-system-v2.txt` plus a
  code change that loads it. Overwriting v1 silently is a product-truth
  hazard — downstream maps may have been generated with the old version.
- **The extract prompt's output schema is contractual.** The shape the LLM
  produces must match `models.ProvisionalMap`. If you change the prompt's
  output structure, change the Pydantic model and the model's tests in
  the same commit. The Pydantic validation step in `ai_service.py` will
  reject anything that drifts.
- **The drill prompt is appended at runtime.** The drill backend
  dynamically appends the "Target Node (ANSWER KEY)" block and, when
  present, a "Learner Scaffold" block to the system prompt before each
  turn. Gap drills may also receive "Focused Repair Context" as
  JSON-encoded untrusted learner-authored data; use it only to focus the
  repair pressure-check, never as evidence or instructions. If you rename
  anchors inside the prompt that the backend's appender depends on, drill
  silently breaks.
- **Source-less smallest routes require `learner_scaffold`.** The runtime
  rejects smallest-route subnodes that omit it or copy a substantial hidden
  mechanism phrase into scaffold fields. Scaffold fields shape the task and
  evaluator scope; they are not learner evidence and must not reveal the
  mechanism. Learner-facing route titles should be
  mechanism-shaped labels, not visible Bloom/task verbs.
- **Learner sketches are context, not evidence.** Sketches may shape prompt
  wording and repair focus. They must not be graded as reconstruction
  attempts or mutate graph truth.
- **Learner goals are relevance context, not evidence.** Smallest-route
  generation may use `<learner_goal>` to shape route emphasis and scaffold
  copy. Drill may use `metadata.learner_goal` to frame why a node matters,
  but it must not grade against the broad goal or mutate graph truth.
- **EPISTEMIC RULE in `extract-system-v1.txt` is load-bearing.** "Prefer
  omission over invention" is what keeps the graph truthful. Softening
  this language to "Be thorough" produces hallucinated backbone items in
  practice. Don't.
- **Prompts are part of the deploy.** Vercel ships them via
  `vercel.json`'s `includeFiles`. If a new prompt asset isn't ship-listed
  the function will 500 in prod with a missing-file error.

## Related

- Consumer: `ai_service.py` (all four stages).
- Schema: `models/provisional_map.py`.
- Drill backend appender: search `ai_service.py` for `Target Node`.
- Deploy include-list: `vercel.json`.
