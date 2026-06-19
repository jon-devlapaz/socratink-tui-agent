# Security Policy

## Reporting Vulnerabilities

Report suspected vulnerabilities privately to the maintainer before opening a
public issue. Include the affected command, route, or workflow; reproduction
steps; expected impact; and any relevant logs with secrets redacted.

Do not include API keys, tokens, private prompts, learner data, Railway secrets,
or `.env` contents in issues, pull requests, commits, screenshots, or agent
handoffs.

## Secrets

This repository uses Gitleaks through pre-commit and CI to catch accidental
secret commits. If a secret is committed or exposed, rotate it first, then remove
or redact the repository reference. Treat git history as durable once pushed.
