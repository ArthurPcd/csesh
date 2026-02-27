# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-27

### Security

- Bundle Chart.js, marked, DOMPurify locally (removed CDN dependencies)
- Remove Google Fonts dependency (use system fonts)
- Bind server to 127.0.0.1 only (was exposed on LAN)
- Add 1MB request body size limit
- Fix CORS to strict localhost matching

### Added

- Streamer mode — blur sensitive info during screen recordings
- Batch trash and restore operations in web dashboard
- Logo click and 'g' keyboard shortcut to go to dashboard
- Enhanced stats: avg cost per session, cost by day, top files, thinking ratio
- Collapsible sidebar with localStorage persistence
- Tab-based tier filtering in dashboard

### Fixed

- XSS vulnerabilities in dashboard (DOMPurify sanitization)
- Navigation: sidebar collapse, project switching, back button
- Author email in package.json

## [1.0.0] - 2026-02-27

### Added

- CLI with 12 commands: list, show, analyze, search, stats, cleanup, resume, tag, title, export, web, trash, cache
- Interactive web dashboard with 6 charts and 9 stat cards
- 4-tier session classification engine
- Deep analysis: tool usage, thinking metrics, files touched, auto-tags, sub-agent detection
- Full-text search with project and date filtering
- Safe cleanup with trash/restore manifest
- Export as JSON, CSV, or Markdown
- Cost estimation with per-model token pricing
- Custom metadata: titles, tags, favorites, notes (sidecar, never modifies originals)
- Keyboard shortcuts (j/k navigation, /, Enter, Esc, f, t, ?)
- Skills.sh integration
- CI/CD with GitHub Actions and npm Trusted Publishing (OIDC)

[1.1.0]: https://github.com/ArthurPcd/csesh/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ArthurPcd/csesh/releases/tag/v1.0.0
