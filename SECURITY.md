# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 4.x     | Yes       |
| 3.x     | No        |
| < 3.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** contact@arthurpacaud.dev

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

## Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 1 week
- **Fix or mitigation:** as soon as possible, depending on severity

Please do **not** open a public GitHub issue for security vulnerabilities.

## Scope

This tool runs locally and serves a web dashboard on localhost. Key security considerations:
- The API server binds to `127.0.0.1` only
- CORS is restricted to localhost origins
- Body size limited to 1 MB
- Session data is read-only by default; `csesh rename` modifies JSONL files with backup + atomic write
- All HTML rendered in the dashboard is sanitized via DOMPurify
- No external network requests — vendor libraries (Chart.js, marked, DOMPurify) are bundled locally
- No authentication required (local-only tool)
- Terminal commands validated against a strict allowlist pattern
