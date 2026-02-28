<p align="center">
  <img src="https://img.shields.io/npm/v/@arthurpcd/csesh.svg?color=%2322c55e&label=npm" alt="npm version" />
  <img src="https://img.shields.io/badge/dependencies-0-22c55e" alt="zero dependencies" />
  <img src="https://img.shields.io/npm/dm/@arthurpcd/csesh.svg?color=%2322c55e" alt="downloads" />
  <img src="https://img.shields.io/badge/tests-233%20passing-22c55e" alt="tests" />
  <img src="https://img.shields.io/badge/version-4.0.0-22c55e" alt="version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18.3-22c55e" alt="node" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="license" />
</p>

<pre align="center">

     ██████╗ ███████╗ ███████╗ ███████╗ ██╗  ██╗
    ██╔════╝ ██╔════╝ ██╔════╝ ██╔════╝ ██║  ██║
    ██║      ███████╗ █████╗   ███████╗ ███████║
    ██║      ╚════██║ ██╔══╝   ╚════██║ ██╔══██║
    ╚██████╗ ███████║ ███████╗ ███████║ ██║  ██║
     ╚═════╝ ╚══════╝ ╚══════╝ ╚══════╝ ╚═╝  ╚═╝

</pre>

<h3 align="center">The missing session manager for Claude Code.</h3>

<p align="center">
  Search, analyze, classify, rename, and clean up your sessions.<br/>
  From the CLI or a full web dashboard. Zero dependencies. Zero telemetry.<br/>
  <strong>Your data never leaves your machine.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@arthurpcd/csesh"><strong>npm</strong></a> &nbsp;|&nbsp;
  <a href="https://github.com/ArthurPcd/csesh"><strong>GitHub</strong></a> &nbsp;|&nbsp;
  <a href="https://skills.sh"><strong>skills.sh</strong></a> &nbsp;|&nbsp;
  <a href="https://github.com/ArthurPcd/csesh/discussions"><strong>Discussions</strong></a> &nbsp;|&nbsp;
  <a href="https://github.com/sponsors/ArthurPcd"><strong>Sponsor</strong></a>
</p>

---

## The problem

Claude Code stores every conversation as a JSONL file. After a few weeks, you have dozens of sessions. After a few months: hundreds.

- Which session had the auth refactor?
- How much did those 300 sessions cost?
- Which ones are empty junk and which ones are real work?
- How do I resume *that* session from two weeks ago?

There was no tool to answer these questions. Now there is.

```bash
npx @arthurpcd/csesh web
```

That's it. One command, no install, no config. The dashboard opens in your browser.

---

## Why csesh

| | Before csesh | With csesh |
|---|---|---|
| **Find a session** | Open JSONL files in VSCode, scroll through raw JSON | `csesh search "refactor auth"` -- instant results |
| **Know your costs** | No idea | `csesh cost` -- today, this week, this month, all-time with sparkline |
| **Clean up junk** | Delete manually, hope you don't lose something | 4-tier auto-classification, safe trash with restore |
| **Resume a session** | Copy-paste a UUID from a file path | `csesh rename` + `csesh resume` -- picker with names you chose |
| **Dependencies** | -- | **0.** Zero npm dependencies. Zero CDN. Zero tracking. |

---

## Quick Start

```bash
# Run directly (no install needed)
npx @arthurpcd/csesh web

# Or install globally
npm install -g @arthurpcd/csesh
csesh web

# Or install as a Claude Code skill via skills.sh
npx skills add ArthurPcd/csesh
```

The dashboard opens at `http://localhost:3456`.

---

## What's new in v4.0.0

- **Wider activity heatmap** — 70/30 split gives the heatmap more room to breathe
- **Stacked top section** — heatmap (365d) + activity (30d) on the left, Top Sessions on the right, same height
- **Token Breakdown chart** — doughnut showing input/output/cache read/cache write proportions
- **Cost by Project fixed** — now computed server-side with client-side fallback
- **Classify & Clean workflow** — documented end-to-end flow: `analyze → cleanup --dry-run → cleanup`, with tag/title follow-ups
- **Claude Code skill integration** — SKILL.md now documents the full classify/clean workflow so Claude Code knows how to orchestrate it

---

## What csesh does

### Classify

Every session is automatically assigned a tier:

| Tier | Label | What it means |
|:---:|---|---|
| 1 | **Auto-delete** | Empty, hook-only, snapshot. 100% safe to remove. |
| 2 | **Suggested** | Short, abandoned. Quick review recommended. |
| 3 | **Review** | Mixed signals. Manual review needed. |
| 4 | **Keep** | Real work happened here. |

The classifier is conservative -- it promotes borderline sessions to "keep" rather than risk losing real work. You can override any tier manually.

### Analyze

```bash
csesh analyze <id>
```

```
  Deep Analysis: Fix login bug

  Tier:           [keep]
  Turn count:     47
  Tool calls:     156 (3 failed)
  Thinking:       28 blocks, 41,203 chars
  Files touched:  12
  Language:       en
  Auto-tags:      #bugfix #auth #typescript

  Tool Breakdown:
    Edit              52  ████████████████████
    Read              38  ██████████████
    Bash              31  ████████████
    Grep              22  ████████
    Glob              13  █████
```

### Search

```bash
csesh search "docker migration"
csesh search "refactor" --project myapp --from 2025-01-01
```

Full-text search across all your sessions. Instant results.

### Rename & Resume

**The killer feature.** csesh is the only tool that syncs session names with `claude --resume`.

```bash
csesh rename
#  Interactive picker — select a session, type the new name
#  agile-fluttering-turing → fix-login-bug
#  Now visible in claude --resume as fix-login-bug

csesh rename a1b2c3d4 "Fix login bug"
#  Or rename directly by ID

csesh resume
#  Pick from a list with tier badges, tags, and project info
#  cd's into the project directory and launches claude --resume
```

Under the hood: writes a `custom-title` record in the JSONL file so `claude --resume` displays your renamed title natively. Backup + atomic write -- your original data is always safe.

### Track costs

```bash
csesh cost
```

```
  ⬡ csesh — Cost Breakdown

  ┌────────────────────┬──────────────┬────────────┐
  │ PERIOD             │ COST         │ SESSIONS   │
  ├────────────────────┼──────────────┼────────────┤
  │ Today              │ $12.34       │ 5          │
  │ This week          │ $89.21       │ 23         │
  │ This month         │ $342.17      │ 74         │
  │ All time           │ $1,627.54    │ 312        │
  └────────────────────┴──────────────┴────────────┘

  Last 14 days: ▁▂▃▁▅▂▁▃▇▁▂█▃▁
```

### Classify & Clean

The full workflow to organize and clean up sessions:

```bash
csesh analyze                 # deep analysis + auto-classify all sessions
csesh cleanup --dry-run       # preview what would be trashed
csesh cleanup --tier1-only    # remove tier 1 (100% safe)
csesh cleanup                 # interactive: prompts per tier
```

After analyzing, tag and title the sessions worth keeping:

```bash
csesh tag <id> bugfix         # tag important sessions
csesh title <id> "Fix auth"   # name unnamed sessions
csesh web                     # visual review in the dashboard
```

Nothing is ever deleted directly. Everything goes to trash with a manifest. Restore anytime with `csesh trash restore <id>`. The dashboard automatically reflects classification — the Refresh button re-fetches and re-classifies all sessions.

### Web dashboard

`csesh web` launches a full interactive dashboard:

- 10 stat cards with cost tracking and weekly comparison
- Activity heatmap (365 days) + activity chart (30 days) stacked alongside Top Sessions
- 7 charts: model distribution, token breakdown, tier distribution, cost over time, cost by project, top tools, top files
- Session table with sort, filter, batch operations
- Detail view with full conversation, Markdown rendering, syntax highlighting, collapsible thinking blocks
- **In-conversation search**: find specific messages with text highlighting, match navigation, and display modes (Cmd+F)
- **Resume from dashboard**: copy-paste `claude --resume` commands or open directly in terminal
- **Custom title sync**: renamed sessions appear natively in `claude --resume` picker
- Streamer mode: blur sensitive paths for screen recordings
- Dark/light/auto theme
- Keyboard shortcuts: `j/k` navigate, `g` dashboard, `Cmd+F` search in conversation, `f` favorite, `t` trash

**Everything runs locally on `127.0.0.1`.** No external requests. The three front-end libraries (Chart.js, marked, DOMPurify) are vendored locally.

---

## Zero dependencies

```
$ npm ls
@arthurpcd/csesh@4.0.0
└── (empty)
```

csesh has **zero npm dependencies**. The three libraries that most CLI tools depend on -- chalk, cli-table3, commander -- are replaced by native modules:

| What | Was | Now | Lines |
|---|---|---|---:|
| Terminal colors | chalk (72 KB) | `lib/colors.js` -- ANSI escape codes + Proxy | 55 |
| Table formatting | cli-table3 (68 KB + 5 transitive deps) | `lib/table.js` -- UTF-8 box drawing | 120 |
| CLI parsing | commander (220 KB) | `lib/cli.js` -- `util.parseArgs` native | 270 |

**Why it matters:**
- `npx @arthurpcd/csesh web` resolves in under 2 seconds on a cold machine
- Zero supply chain attack vectors (cli-table3 pulled `@colors/colors`, the fork of the sabotaged `colors.js`)
- `npm audit` has nothing to audit
- No `node_modules` bloat, no transitive dependency surprises

---

## Full CLI Reference

| Command | Description |
|---|---|
| `csesh list` | List sessions (filter by tier, tag, project, favorites) |
| `csesh show <id>` | Full session detail with metadata, tokens, cost |
| `csesh analyze [id]` | Deep analysis: tools, thinking, files, auto-tags |
| `csesh search <query>` | Full-text search with project and date filtering |
| `csesh stats` | Aggregated statistics across all sessions |
| `csesh cost` | Cost breakdown: today / week / month / all-time + sparkline |
| `csesh cleanup` | Interactive trash by tier (dry-run available) |
| `csesh resume` | Interactive picker to resume a session in Claude Code |
| `csesh rename <id> <title>` | Rename session slug (syncs with `claude --resume`) |
| `csesh tag <id> <tag>` | Add a tag to a session |
| `csesh title <id> <title>` | Set a custom display title |
| `csesh export` | Export as JSON, CSV, or Markdown |
| `csesh web` | Start the web dashboard |
| `csesh doctor` | Health check: Claude dir, cache, metadata, versions |
| `csesh trash list\|restore\|delete\|empty` | Manage trashed sessions |
| `csesh cache clear\|stats` | Manage the scan cache |

All commands support `--json` for machine-readable output. Use `--help` on any command for full options.

---

## Architecture

```
bin/csesh.js            CLI entry point (zero external dependencies)

lib/
  scanner.js            JSONL parser: fast mode (headers) + full mode (deep analysis)
  classifier.js         4-tier engine: weighted signals, conservative promotion
  analyzer.js           Tool usage, thinking metrics, auto-tags, language detection
  cache.js              Disk cache keyed by file path + mtime + size
  metadata.js           Sidecar store: titles, tags, favorites, notes
  rename.js             JSONL slug rewriter (backup + atomic write)
  cleanup.js            Trash with manifest restore, never direct delete
  search.js             Full-text search, filtering, sorting
  stats.js              Aggregated statistics and cost estimation
  cli.js                Native CLI framework (util.parseArgs)
  colors.js             Native ANSI colors (Proxy-based)
  table.js              Native table formatter (UTF-8 box drawing)
  utils.js              Shared constants and helpers
  config.js             Configuration loader

web/
  server.js             Native Node.js HTTP server (http.createServer)
  dashboard.html        Single-file dashboard (vanilla HTML/CSS/JS)
  vendor/               Chart.js, marked, DOMPurify (vendored, no CDN)

skills/csesh/
  SKILL.md              skills.sh integration (Claude Code agent skill)
```

### Data safety principles

1. **Original JSONL files are never deleted.** Cleanup moves to trash with a manifest.
2. **Metadata is stored in a sidecar.** Titles, tags, favorites, notes live in `metadata.json`, not in the JSONL.
3. **Rename creates a backup.** `csesh rename` writes a `.bak` before modifying the slug, using atomic write (temp + rename).
4. **Uninstall leaves no trace.** Remove csesh and your Claude Code data is exactly as it was.

---

## REST API

The web server exposes a full REST API at `http://localhost:<port>/api/`.

<details>
<summary>View all endpoints</summary>

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List sessions. Params: `project`, `tier`, `tag`, `favorite`, `sort`, `q`, `limit`, `offset` |
| `GET` | `/api/sessions/:id` | Session detail (triggers deep analysis if not cached) |
| `GET` | `/api/sessions/:id/messages` | Conversation messages with rich content blocks |
| `PATCH` | `/api/sessions/:id/meta` | Update title / notes (also renames JSONL slug) |
| `POST` | `/api/sessions/:id/tags` | Add a tag |
| `DELETE` | `/api/sessions/:id/tags/:tag` | Remove a tag |
| `POST` | `/api/sessions/:id/favorite` | Toggle favorite |
| `POST` | `/api/sessions/:id/tier` | Override tier (1--4) |
| `GET` | `/api/stats` | Aggregated statistics |
| `GET` | `/api/projects` | Project breakdown |
| `GET` | `/api/search` | Full-text search. Param: `q` |
| `GET` | `/api/tags` | All known tags |
| `POST` | `/api/trash/:id` | Trash a session |
| `POST` | `/api/batch/trash` | Batch trash `{ "ids": [...] }` |
| `POST` | `/api/batch/tag` | Batch tag `{ "ids": [...], "tag": "..." }` |
| `POST` | `/api/batch/trash-delete` | Batch permanent delete from trash |
| `POST` | `/api/batch/restore` | Batch restore from trash |
| `GET` | `/api/trash` | List trashed sessions |
| `POST` | `/api/restore/:id` | Restore from trash |
| `DELETE` | `/api/trash/:id` | Permanently delete from trash |

</details>

---

## Security

- **Binds to `127.0.0.1` only** -- the dashboard is never exposed to the network
- **CORS strict** -- only same-origin requests accepted
- **Body limit** -- 1 MB max request body
- **DOMPurify** -- all HTML sanitized before rendering
- **No CDN, no external requests** -- everything served from local vendored files
- **npm Trusted Publishing** -- published via GitHub Actions OIDC (no stored tokens)

---

## Configuration

Create `config.json` in the tool directory to override defaults:

```json
{
  "webPort": 3456,
  "scanMode": "fast",
  "defaultSort": "date",
  "pageSize": 50
}
```

---

## Community

- [GitHub Discussions](https://github.com/ArthurPcd/csesh/discussions) — feature requests, Q&A, feedback
- [skills.sh](https://skills.sh) — install csesh as a Claude Code agent skill

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache-2.0 -- see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://jpstudio.fr">Arthur Pacaud</a> (<a href="https://github.com/ArthurPcd">@ArthurPcd</a>)
  <br/><br/>
  If csesh saves you time, <a href="https://github.com/ArthurPcd/csesh">star the project</a> and consider <a href="https://github.com/sponsors/ArthurPcd">sponsoring</a>.
</p>
