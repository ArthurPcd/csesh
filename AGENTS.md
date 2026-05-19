# AGENTS.md

Conventions for AI coding agents (Claude Code, Codex, Aider, etc.) working in this repo.

## Project

`@arthurpcd/csesh` — a Node.js CLI plus web dashboard to navigate, search, analyze, and clean up Claude Code sessions. Distributed via npm, Homebrew, and a Tauri desktop wrapper (separate repo).

## Stack constraints

- **Node.js 18+**, ESM only (`type: "module"`)
- **Zero npm runtime dependencies** — colors, tables, CLI parsing are all native implementations in `lib/`
- **No build step** — what is in `lib/`, `bin/`, `web/` is what ships
- **Vendor locally** — `web/vendor/` holds Chart.js, marked, DOMPurify. No CDN refs.
- **Native HTTP** in `web/server.js` — no Express or similar framework

When proposing a change, respect these. If a dep is genuinely necessary, raise it in the issue before opening a PR.

## Commit + PR conventions

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- One logical change per PR
- No co-authored-by trailers, no AI attribution in commit messages or PR bodies
- CI must be green (`npm test` on Node 18 / 20 / 22 + `npm pack --dry-run` smoke test)

## Agent skills

### Issue tracker

GitHub Issues at `github.com/ArthurPcd/csesh`. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Custom taxonomy (type / priority / status / special). Pocock's five canonical triage roles map onto this taxonomy. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context repo. No `CONTEXT.md` yet — proceed silently if a skill expects it. See [docs/agents/domain.md](docs/agents/domain.md).
