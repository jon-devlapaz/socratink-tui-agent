# Pedagogical Agents

This folder defines the founder-facing TUI's pedagogical subagent contracts.
These are not autonomous graph mutators. They are narrow LLM roles that propose
moves inside the Socratink loop.

System rule:

```text
Agents propose moves.
Training store records events.
Derivation decides truth.
Graph displays only derived evidence.
```

The Socratink Orchestrator owns the learning contract, traversal policy,
training-store writes, graph-truth boundaries, and evidence rules.

## Why This Lives Here

The TUI is the product lab. Keeping this in a sibling workspace lets the team
harden the learning contract without patching the browser UI while the loop is
still changing.

When the contracts stabilize, promote the durable pieces into the production
app surfaces that call the real training-store/training-derive boundary.

## Contract File

`contracts.json` defines each role:

- `job`
- `inputs_allowed`
- `required_outputs`
- `may_propose_events`
- `may_write_events`
- `truth_permission`
- `failure_mode_to_guard`

Every subagent has `truth_permission: "none"` and `may_write_events: []`.
