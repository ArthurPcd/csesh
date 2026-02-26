# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

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
- The API server binds to localhost only
- CORS is restricted to localhost origins
- Session data is read-only (original JSONL files are never modified)
- No authentication is required (local-only tool)
