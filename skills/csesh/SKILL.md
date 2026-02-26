---
name: csesh
description: Use csesh to manage Claude Code sessions. Trigger when the user mentions sessions, session management, session cleanup, session history, resuming sessions, or wants to analyze their Claude Code usage. Commands include csesh list, csesh analyze, csesh stats, csesh cleanup, csesh resume, csesh web, csesh tag, csesh title, csesh export.
---

# csesh — Claude Code Session Manager

csesh is a CLI + web dashboard to navigate, search, analyze, and clean up Claude Code sessions.

## Commands

### List sessions
```bash
csesh list                    # latest 50 sessions
csesh list --tier 4           # only "keep" sessions
csesh list --project myapp    # filter by project
csesh list --favorites        # favorites only
csesh list --tag bugfix       # filter by tag
csesh list --sort size        # sort by: date | size | messages | tier
csesh list --junk             # tier 1+2 only
```

### Show session details
```bash
csesh show <id>               # full detail with metadata, tokens, cost
```

### Deep analysis
```bash
csesh analyze <id>            # single session: tool usage, thinking, files
csesh analyze                 # all sessions: summary with distributions
```

### Search
```bash
csesh search "refactor auth"
csesh search "docker" --project myapp
csesh search "migration" --from 2025-01-01 --to 2025-06-30
```

### Statistics
```bash
csesh stats                   # global stats
csesh stats --project myapp   # project-specific
```

### Cleanup junk sessions
```bash
csesh cleanup --dry-run       # preview what would be trashed
csesh cleanup                 # interactive cleanup by tier
csesh cleanup --tier1-only    # 100% safe auto-delete
```

### Resume a session
```bash
csesh resume                  # interactive session picker
csesh resume --project myapp  # filter by project
csesh resume --favorites      # only favorites
csesh resume --tag urgent     # filter by tag
```

### Tag and title
```bash
csesh tag <id> bugfix
csesh title <id> "Auth refactor session"
```

### Export
```bash
csesh export --format json
csesh export --format csv --output sessions.csv
csesh export --session <id>   # single session as Markdown
```

### Web dashboard
```bash
csesh web                     # start on port 3456
csesh web --port 8080
```

### Trash management
```bash
csesh trash list
csesh trash restore <id>
csesh trash delete <id>
csesh trash empty
```

### Cache management
```bash
csesh cache clear
csesh cache stats
```

## When to Suggest Each Command

- User wants to **find a session**: suggest `csesh list` with appropriate filters or `csesh search`
- User wants to **resume work**: suggest `csesh resume` (interactive picker that launches `claude --resume`)
- User wants to **clean up**: suggest `csesh cleanup --dry-run` first, then `csesh cleanup`
- User wants to **understand usage**: suggest `csesh stats` or `csesh analyze`
- User wants a **visual overview**: suggest `csesh web`
- User wants to **export data**: suggest `csesh export` with the appropriate format

## Example Workflows

### Clean up old sessions
```bash
csesh stats                   # see how much space is used
csesh cleanup --dry-run       # preview cleanup
csesh cleanup                 # interactive cleanup
```

### Find and resume a session
```bash
csesh search "auth refactor"  # find it
csesh resume --project myapp  # or browse and pick
```

### Analyze usage patterns
```bash
csesh stats                   # overview
csesh analyze                 # deep analysis across all sessions
csesh web                     # visual dashboard with charts
```

## Installation

```bash
npx @arthurpcd/csesh --help              # run directly
npm install -g @arthurpcd/csesh          # or install globally
```
