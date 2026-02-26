# csesh

[![CI](https://github.com/ArthurPcd/csesh/actions/workflows/ci.yml/badge.svg)](https://github.com/ArthurPcd/csesh/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/csesh.svg)](https://www.npmjs.com/package/csesh)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Navigate, search, analyze, and clean up your Claude Code sessions -- from the command line or a sleek web dashboard.

---

## Feature Highlights

- **4-tier classification engine** -- auto-delete, suggested, review, keep -- applied automatically based on session content
- **Deep analysis** -- tool usage breakdown, thinking metrics, files touched, auto-tags, sub-agent detection
- **Interactive web dashboard** -- charts, batch operations, keyboard shortcuts, conversation viewer with syntax highlighting
- **Resume sessions** -- interactive picker to browse and resume any session with `claude --resume`
- **Custom metadata** -- titles, tags, favorites, notes stored in a separate sidecar (original files never modified)
- **Safe cleanup** -- trash with restore via manifest; original JSONL files are never deleted directly
- **Full-text search** across all sessions with project and date filtering
- **Export** as JSON, CSV, or Markdown
- **Cost estimation** per session and across all sessions, with per-model token pricing

---

## Quick Start

```bash
# Run directly with npx
npx csesh web

# Or install globally
npm install -g csesh
csesh web
```

The web dashboard opens at `http://localhost:3456` by default.

### Skills.sh

```bash
npx skills add ArthurPcd/csesh
```

---

## CLI Reference

### `list` -- List sessions

```bash
csesh list                    # latest 50 sessions
csesh list --limit 100        # custom limit
csesh list --tier 4           # only "keep" sessions
csesh list --tier 1           # only auto-delete candidates
csesh list --tag bugfix       # filter by tag
csesh list --favorites        # favorites only
csesh list --project myapp    # filter by project name
csesh list --sort size        # sort by: date | size | messages | tier
csesh list --junk             # show only junk sessions (tier 1 + 2)
csesh list --real             # show only real sessions (tier 4)
```

### `show <id>` -- Session detail

```bash
csesh show <id>               # full detail with metadata, tokens, cost
```

Displays ID, title, project, date range, duration, message counts, tier, tags, favorites, notes, models, token usage, estimated cost, and file path. Accepts full or partial IDs.

### `analyze [id]` -- Deep analysis

```bash
csesh analyze <id>            # analyze a single session
csesh analyze                 # analyze ALL sessions (may be slow)
```

Single-session output includes tool usage bar chart, files touched, thinking block statistics, auto-tags, sub-agent detection, and language identification. Batch analysis prints a summary with tier distribution, top tools across all sessions, and top tags.

### `search <query>` -- Full-text search

```bash
csesh search "refactor auth"
csesh search "docker" --project myapp
csesh search "migration" --from 2025-01-01 --to 2025-06-30
```

### `stats` -- Aggregated statistics

```bash
csesh stats                   # global stats
csesh stats --project myapp   # project-specific
```

Shows total sessions, disk usage, date range, average duration, tier distribution, cleanup potential, message and token totals, estimated cost, model breakdown, top projects, and top tags.

### `cleanup` -- Identify and trash junk sessions

```bash
csesh cleanup --dry-run       # preview what would be trashed
csesh cleanup                 # interactive cleanup (prompts per tier)
csesh cleanup --tier1-only    # auto-delete tier 1 only (100% safe)
```

### `resume` -- Resume a session

```bash
csesh resume                  # interactive session picker
csesh resume --project myapp  # filter by project
csesh resume --favorites      # only favorites
csesh resume --tag urgent     # filter by tag
csesh resume --limit 10       # show fewer choices
```

Displays an enriched session list with tier badges, favorites, tags, and project info. Select a session by number and it launches `claude --resume <id>`.

### `tag <id> <tag>` -- Add a tag

```bash
csesh tag a1b2c3d4 bugfix
```

### `title <id> <title>` -- Set a custom title

```bash
csesh title a1b2c3d4 "Auth refactor session"
```

### `export` -- Export session data

```bash
csesh export --format json                # all sessions as JSON to stdout
csesh export --format csv                 # all sessions as CSV to stdout
csesh export --format csv --output out.csv  # write to file
csesh export --session <id>               # single session as Markdown
csesh export --session <id> --output s.md # single session to file
```

### `web` -- Start web dashboard

```bash
csesh web                     # start on default port 3456
csesh web --port 8080         # custom port
```

### `trash` -- Manage trashed sessions

```bash
csesh trash list              # list all trashed sessions
csesh trash restore <id>      # restore a session from trash
csesh trash empty             # permanently delete items older than 30 days
csesh trash empty --older-than 7   # custom threshold in days
```

### `cache` -- Manage the scan cache

```bash
csesh cache clear             # clear all cached scan data
csesh cache stats             # show cache entry count and disk size
```

---

## Web Dashboard

Start the dashboard with `csesh web` and open `http://localhost:3456`.

### Overview

- Stat cards for total sessions, disk usage, cleanup potential, and estimated cost
- Activity chart showing session frequency over time
- Distribution charts for models, tiers, and tool usage

### Sessions Table

- Sortable columns: date, project, title, messages, size, tier
- Tier badges with color coding
- Batch selection for multi-session operations (trash, tag)
- Inline search and filtering by project, tier, tag, and favorites

### Detail View

- Editable title, tags, favorites, and notes
- Full conversation viewer with Markdown rendering and syntax-highlighted code blocks
- Collapsible thinking blocks
- Tool usage display with call details
- Token usage and cost breakdown

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate up / down in session list |
| `/` | Focus search field |
| `Enter` | Open selected session |
| `Esc` | Go back / close detail view |
| `f` | Toggle favorite on selected session |
| `t` | Trash selected session |
| `?` | Show keyboard shortcut help |

---

## Tier Classification

| Tier | Label | Description |
|------|-------|-------------|
| 1 | Auto-delete | Empty, hook-only, snapshot-only. 100% safe to remove. |
| 2 | Suggested | Short/abandoned sessions. Quick review recommended. |
| 3 | Review | Needs manual review. Does not clearly fit another tier. |
| 4 | Keep | Substantive conversations with real work. |

Tiers are auto-assigned based on session content (message count, tool usage, duration, file activity). You can override the tier per session via the web dashboard or the REST API.

---

## Architecture

```
csesh/
  bin/
    csesh.js                    # CLI entry point (commander)
  lib/
    analyzer.js                 # Deep session analysis (tools, thinking, tags)
    cache.js                    # Disk cache with mtime + size invalidation
    classifier.js               # 4-tier classification engine
    cleanup.js                  # Trash / restore (never direct delete)
    config.js                   # Configuration loader
    metadata.js                 # Sidecar metadata (titles, tags, favorites, notes)
    scanner.js                  # JSONL file scanner (fast + full modes)
    search.js                   # Filtering, sorting, full-text search
    stats.js                    # Aggregated statistics and cost estimation
    utils.js                    # Shared constants and helpers
  web/
    server.js                   # Native Node.js HTTP server (zero dependencies)
    dashboard.html              # Single-file production dashboard (HTML/CSS/JS)
  skills/
    csesh/SKILL.md              # skills.sh skill definition
  config.default.json           # Default configuration
  package.json
  LICENSE
  CONTRIBUTING.md
  SECURITY.md
```

**Data safety:** Original JSONL session files are never modified. Metadata is stored in a separate `metadata.json` sidecar. Cleanup moves files to `~/.claude-sessions-trash/` with a manifest that enables restore.

---

## Configuration

Create a `config.json` in the tool directory to override defaults:

```json
{
  "webPort": 3456,
  "scanMode": "fast",
  "defaultSort": "date",
  "pageSize": 50
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `webPort` | number | `3456` | Port for the web dashboard |
| `scanMode` | string | `"fast"` | `"fast"` skips deep analysis; `"full"` analyzes every session |
| `defaultSort` | string | `"date"` | Default sort field: `date`, `size`, `messages`, `tier` |
| `pageSize` | number | `50` | Default number of sessions per page |

---

## API Reference

All endpoints are served by the built-in web server at `http://localhost:<port>/api/`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List sessions. Query params: `project`, `tier`, `tag`, `favorite`, `sort`, `q`, `limit`, `offset` |
| `GET` | `/api/sessions/:id` | Session detail (triggers deep analysis if not cached) |
| `GET` | `/api/sessions/:id/messages` | Session messages with rich content blocks |
| `PATCH` | `/api/sessions/:id/meta` | Update title and/or notes |
| `POST` | `/api/sessions/:id/tags` | Add a tag |
| `DELETE` | `/api/sessions/:id/tags/:tag` | Remove a tag |
| `POST` | `/api/sessions/:id/favorite` | Toggle favorite status |
| `POST` | `/api/sessions/:id/tier` | Set tier override (1--4) |
| `GET` | `/api/stats` | Aggregated statistics |
| `GET` | `/api/projects` | Project breakdown |
| `GET` | `/api/search` | Full-text search. Query param: `q` |
| `GET` | `/api/tags` | List all known tags |
| `POST` | `/api/trash/:id` | Trash a session |
| `POST` | `/api/batch/trash` | Batch trash. Body: `{ "ids": [...] }` |
| `POST` | `/api/batch/tag` | Batch tag. Body: `{ "ids": [...], "tag": "..." }` |
| `GET` | `/api/trash` | List trashed sessions |
| `POST` | `/api/restore/:id` | Restore a session from trash |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting issues, submitting pull requests, and setting up a development environment.

---

## License

Apache-2.0 -- see [LICENSE](LICENSE).

---

Built by [Arthur Pacaud](https://jpstudio.fr) ([@ArthurPcd](https://github.com/ArthurPcd))
