# Set up this scaffold

This scaffold is already populated for Socratink TUI.

For normal agent work, read root `AGENTS.md` as the bootloader, then read
`.mex/ROUTER.md` for all context routing.

If the scaffold must be rebuilt from scratch, use the packaged Mex setup flow
outside a dirty branch:

```bash
npx promexeus setup
```

After any rebuild, run:

```bash
npm run mex:check
```
