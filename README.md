# Claude Sessions Organizer

[![npm version](https://img.shields.io/npm/v/claude-sessions-organizer.svg)](https://www.npmjs.com/package/claude-sessions-organizer)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Navigate, search, analyze, and clean up your Claude Code sessions -- from the command line or a sleek web dashboard.

---

## Feature Highlights

- **4-tier classification engine** -- auto-delete, suggested, review, keep -- applied automatically based on session content
- **Deep analysis** -- tool usage breakdown, thinking metrics, files touched, auto-tags, sub-agent detection
- **Interactive web dashboard** -- charts, batch operations, keyboard shortcuts, conversation viewer with syntax highlighting
- **Custom metadata** -- titles, tags, favorites, notes stored in a separate sidecar (original files never modified)
- **Safe cleanup** -- trash with restore via manifest; original JSONL files are never deleted directly
- **Full-text search** across all sessions with project and date filtering
- **Export** as JSON, CSV, or Markdown
- **Cost estimation** per session and across all sessions, with per-model token pricing

---

## Quick Start

```bash
# Run directly with npx
npx claude-sessions-organizer web

# Or install globally
npm install -g claude-sessions-organizer
claude-sessions web
```

The web dashboard opens at `http://localhost:3456` by default.

---

## CLI Reference

### `list` -- List sessions

```bash
claude-sessions list                    # latest 50 sessions
claude-sessions list --limit 100        # custom limit
claude-sessions list --tier 4           # only "keep" sessions
claude-sessions list --tier 1           # only auto-delete candidates
claude-sessions list --tag bugfix       # filter by tag
claude-sessions list --favorites        # favorites only
claude-sessions list --project myapp    # filter by project name
claude-sessions list --sort size        # sort by: date | size | messages | tier
claude-sessions list --junk             # show only junk sessions (tier 1 + 2)
claude-sessions list --real             # show only real sessions (tier 4)
```

### `show <id>` -- Session detail

```bash
claude-sessions show <id>              # full detail with metadata, tokens, cost
```

Displays ID, title, project, date range, duration, message counts, tier, tags, favorites, notes, models, token usage, estimated cost, and file path. Accepts full or partial IDs.

### `analyze [id]` -- Deep analysis

```bash
claude-sessions analyze <id>           # analyze a single session
claude-sessions analyze                # analyze ALL sessions (may be slow)
```

Single-session output includes tool usage bar chart, files touched, thinking block statistics, auto-tags, sub-agent detection, and language identification. Batch analysis prints a summary with tier distribution, top tools across all sessions, and top tags.

### `search <query>` -- Full-text search

```bash
claude-sessions search "refactor auth"
claude-sessions search "docker" --project myapp
claude-sessions search "migration" --from 2025-01-01 --to 2025-06-30
```

### `stats` -- Aggregated statistics

```bash
claude-sessions stats                  # global stats
claude-sessions stats --project myapp  # project-specific
```

Shows total sessions, disk usage, date range, average duration, tier distribution, cleanup potential, message and token totals, estimated cost, model breakdown, top projects, and top tags.

### `cleanup` -- Identify and trash junk sessions

```bash
claude-sessions cleanup --dry-run      # preview what would be trashed
claude-sessions cleanup                # interactive cleanup (prompts per tier)
claude-sessions cleanup --tier1-only   # auto-delete tier 1 only (100% safe)
```

### `tag <id> <tag>` -- Add a tag

```bash
claude-sessions tag a1b2c3d4 bugfix
```

### `title <id> <title>` -- Set a custom title

```bash
claude-sessions title a1b2c3d4 "Auth refactor session"
```

### `export` -- Export session data

```bash
claude-sessions export --format json                # all sessions as JSON to stdout
claude-sessions export --format csv                 # all sessions as CSV to stdout
claude-sessions export --format csv --output out.csv  # write to file
claude-sessions export --session <id>               # single session as Markdown
claude-sessions export --session <id> --output s.md # single session to file
```

### `web` -- Start web dashboard

```bash
claude-sessions web                    # start on default port 3456
claude-sessions web --port 8080        # custom port
```

### `trash` -- Manage trashed sessions

```bash
claude-sessions trash list             # list all trashed sessions
claude-sessions trash restore <id>     # restore a session from trash
claude-sessions trash empty            # permanently delete items older than 30 days
claude-sessions trash empty --older-than 7   # custom threshold in days
```

### `cache` -- Manage the scan cache

```bash
claude-sessions cache clear            # clear all cached scan data
claude-sessions cache stats            # show cache entry count and disk size
```

---

## Web Dashboard

Start the dashboard with `claude-sessions web` and open `http://localhost:3456`.

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
claude-sessions-organizer/
  bin/
    claude-sessions.js          # CLI entry point (commander)
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
