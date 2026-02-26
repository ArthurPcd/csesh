# Contributing to Claude Sessions Organizer

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/ArthurPcd/claude-sessions-organizer.git
cd claude-sessions-organizer
npm install
npm link  # makes `claude-sessions` available globally
```

## Code Style

- **ESM only** — all files use `import`/`export`, no CommonJS
- **No build step** — source is what ships
- **No external CDN additions** — dashboard.html already includes Chart.js and marked.js, no new CDN dependencies
- **Native Node.js** — no Express or other HTTP frameworks for the server
- **Minimal dependencies** — only `commander`, `chalk`, and `cli-table3`

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Test the CLI commands: `claude-sessions list`, `claude-sessions web`
4. Test the web dashboard interactions
5. Submit a PR

## Pull Request Process

- Keep PRs focused — one feature or fix per PR
- Update README.md if adding new CLI commands or API endpoints
- All code must work on Node.js 18+
- No new npm dependencies without discussion first

## Reporting Issues

- Use the [bug report template](https://github.com/ArthurPcd/claude-sessions-organizer/issues/new?template=bug.yml) for bugs
- Use the [feature request template](https://github.com/ArthurPcd/claude-sessions-organizer/issues/new?template=feature.yml) for ideas
- Include your Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
