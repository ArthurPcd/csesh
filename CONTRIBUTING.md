# Contributing to csesh

Thanks for your interest. csesh is maintained by [Arthur Pacaud](https://arthurpacaud.fr) as part of Pacaud Services. The project is small and intentional — read this first.

## Quick decision tree

- **Typo, small doc fix, obvious one-liner?** → Open a PR directly.
- **Bug or feature?** → [Open an issue](https://github.com/ArthurPcd/csesh/issues/new/choose) first. Wait for triage before writing code on anything non-trivial.
- **Question / unsure?** → Use the question issue template, or check the [README](README.md).

## Development setup

```bash
git clone https://github.com/ArthurPcd/csesh.git
cd csesh
npm install
npm link              # makes `csesh` available globally on PATH
csesh --help          # smoke test
```

Run the local web dashboard:

```bash
csesh web             # serves dashboard on http://localhost:8765
```

Run the test suite:

```bash
npm test              # node --test under test/
```

## Code style

- **ESM only** — `import`/`export`, no CommonJS
- **No build step** — source is what ships
- **No external CDN** — vendor everything locally under `web/vendor/`
- **Native Node.js** — no Express or other HTTP frameworks
- **Zero npm dependencies** — CLI parsing, colors, table formatting are native in `lib/`
- **Node.js 18+** — all code must run on `engines.node >= 18.3.0`

## Pull request workflow

1. Open or claim an issue first (skip only for tiny fixes)
2. Branch from `main` — naming: `feat/short-slug`, `fix/short-slug`, `docs/short-slug`, `chore/short-slug`
3. Make focused changes — one logical change per PR
4. Run `npm test` locally — must pass on Node.js 18, 20, 22 (CI checks all three)
5. Update `README.md` if you add or change a CLI command or API endpoint
6. Open the PR using the template — fill in What / Why / How / Checklist
7. CI runs on push and on PR — green before merge

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add session size filter to dashboard`
- `fix: handle missing classifier output gracefully`
- `docs: clarify cleanup safety in README`
- `chore: bump test fixtures for new schema`
- `refactor: extract metadata loader from scanner`

No co-authored-by trailers. No AI attribution.

## Issue triage

Issues flow through a small state machine. Labels are visible in the [labels view](https://github.com/ArthurPcd/csesh/labels):

- **Type** — `type:bug`, `type:feat`, `type:docs`, `type:chore`
- **Priority** — `priority:high`, `priority:med`, `priority:low`
- **Status** — `status:triage` (new, awaiting maintainer), `status:active` (being worked), `status:blocked` (waiting on input)
- **Special** — `good first issue`, `help wanted`, `wontfix`

New issues land with `status:triage` and a `type:*` label applied by the template. A maintainer adds the priority and either moves to `status:active`, requests more info (comment + leave `status:triage`), or closes with `wontfix`.

If you want to pick up an issue: comment to claim it. Issues with `help wanted` are explicitly open for contributors.

## Reporting bugs

Use the [bug report template](https://github.com/ArthurPcd/csesh/issues/new?template=bug_report.yml). Include:

- csesh version (`csesh --version`)
- Install method (npm / npx / Homebrew / source)
- Claude Code version (`claude --version`)
- Node.js version and OS
- Minimal reproduction steps

Security issues: see [SECURITY.md](SECURITY.md) — do not file a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).
