# Sync this scaffold

Use the repo gate:

```bash
npm run mex:check
```

This runs `mex check --json` and the repo-local semantic truth overlay in
`scripts/check-mex-truth.mjs`.

For a dry-run sync prompt from Mex:

```bash
mex sync --dry-run
```

Do not add separate sync shell scripts unless this command becomes repetitive
and the script earns its maintenance cost.
