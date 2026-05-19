# Triage Labels

This repo uses a custom taxonomy with four axes — **type**, **priority**, **status**, and **special**. Pocock's five canonical triage roles map onto this taxonomy as follows:

| Pocock canonical role | This repo's mechanism                                       | Meaning                                  |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `needs-triage`        | `status:triage`                                             | Maintainer needs to evaluate this issue  |
| `needs-info`          | `status:blocked` + comment requesting info                  | Waiting on reporter for more information |
| `ready-for-agent`     | `help wanted` + `priority:*` + clear spec in body           | Fully specified, ready for an AFK agent  |
| `ready-for-human`     | `status:active` (default — no agent label)                  | Requires human implementation            |
| `wontfix`             | Close with `--reason not_planned` and `wontfix` label       | Will not be actioned                     |

When a skill applies a "role" label, translate to the mechanism above. Example: "apply `ready-for-agent`" becomes "add `help wanted`, add a priority label, ensure the body has acceptance criteria".

## Full label taxonomy

### Type (applied at issue creation by template)

- `type:bug` — something not working
- `type:feat` — new feature or request
- `type:docs` — documentation
- `type:chore` — maintenance, deps, refactor

### Priority (applied at triage)

- `priority:high` — drop other work
- `priority:med` — plan into next sprint
- `priority:low` — backlog

### Status (state machine)

- `status:triage` — new, awaiting maintainer evaluation (default on creation)
- `status:active` — being worked on
- `status:blocked` — waiting on input, decision, or upstream

### Special

- `good first issue` — newcomer-friendly
- `help wanted` — explicitly open for contributors, AFK-agent ready
- `wontfix` — declined

## Triage flow

```
issue created
  → status:triage + type:*
  ↓
maintainer reviews
  ├─ needs more info → status:blocked + comment
  ├─ accepted       → status:active + priority:*  ──→  PR opened, merge, close
  ├─ AFK-ready      → help wanted + priority:* + acceptance criteria
  └─ declined       → wontfix + close (not_planned)
```
