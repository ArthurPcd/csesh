# Domain Docs

How AI coding agents should consume this repo's domain documentation.

## Layout

Single-context repo. The whole project is one concern: navigating, classifying, and cleaning Claude Code sessions.

There is currently **no** `CONTEXT.md` and **no** `docs/adr/`. If a skill expects them, proceed silently — do not flag absence, do not suggest creating them upfront. They will be created lazily by the producer skill (`/grill-with-docs`) when a domain term or architectural decision actually needs to crystallize.

## Domain vocabulary (informal)

Until a formal `CONTEXT.md` exists, treat these as the canonical terms:

- **Session** — a single Claude Code conversation, stored as a `.jsonl` file under `~/.claude/projects/<project-key>/`
- **Project key** — the URL-encoded form of an absolute path (e.g. `-Users-paco-dev-pro-csesh-app`)
- **Tier** — classification label assigned by `lib/classifier.js` (e.g. small / medium / large by message count or token cost)
- **Cache** — `cache.json` at repo or user home root, stores derived session metadata to avoid re-scanning
- **Trash** — soft-deleted sessions kept under `trash/` with a manifest for restore
- **Cost** — derived from session token usage, formatted via `lib/colors.js`
- **Cleanup** — bulk delete / archive of sessions matching a filter

If you introduce a new term in an issue, PR, or doc, check this list first. Don't drift to synonyms unless the existing term is genuinely wrong.

## ADRs

None yet. If you make a non-obvious architectural choice (e.g. swap the classifier strategy, change cache format), write up a short ADR under `docs/adr/0001-*.md` and reference it from the PR.

## Flag conflicts explicitly

If your proposal contradicts the README, `package.json` constraints (zero deps, ESM, no build step), or an existing ADR, call it out in the issue or PR body rather than silently overriding.
