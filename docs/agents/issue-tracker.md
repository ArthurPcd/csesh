# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues at `github.com/ArthurPcd/csesh`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. Apply labels at creation via `--label type:bug --label status:triage` (or whichever fit).
- **Read an issue**: `gh issue view <number> --comments`
- **List by status**: `gh issue list --label status:triage --state open --json number,title,body,labels,comments`
- **Comment**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close with reason**: `gh issue close <number> --comment "..." --reason completed|not_planned`

`gh` infers the repo from `git remote -v` when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue using the appropriate template (`bug_report.yml` / `feature_request.yml` / `question.yml`). The template auto-applies `type:*` and `status:triage`.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`.

## When a skill says "move issue to AFK-ready"

Apply `help wanted` and `priority:*`. Add a comment with the full spec (so an agent can pick it up cold). See [triage-labels.md](triage-labels.md) for the canonical-role mapping.
