/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

/**
 * Native table formatter — replaces cli-table3 with zero dependencies.
 * Box-drawing characters, fixed column widths, word wrap.
 */

// Strip ANSI escape sequences for accurate length calculation
function stripAnsi(str) {
  return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

// Visible length (ignoring ANSI codes)
function visLen(str) {
  return stripAnsi(str).length;
}

// Pad/truncate a string to exactly `width` visible characters, preserving ANSI
function fit(str, width) {
  str = String(str);
  const vis = stripAnsi(str);
  if (vis.length > width) {
    // Truncate: walk through original string tracking visible chars
    let result = '';
    let seen = 0;
    let inEsc = false;
    for (const ch of str) {
      if (ch === '\x1b') inEsc = true;
      if (inEsc) {
        result += ch;
        if (ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z') inEsc = false;
        continue;
      }
      if (seen >= width - 1) {
        result += '\u2026'; // …
        break;
      }
      result += ch;
      seen++;
    }
    // Reset any open ANSI sequences
    result += '\x1b[0m';
    return result;
  }
  // Pad with spaces
  return str + ' '.repeat(width - vis.length);
}

// Wrap text to fit width, returning array of lines
function wrap(str, width) {
  str = String(str);
  const vis = stripAnsi(str);
  if (vis.length <= width) return [str];
  // ANSI-colored content: truncate with fit (preserves escape codes)
  if (str !== vis) return [fit(str, width)];
  // Plain text: word-boundary wrap
  const words = vis.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + (line ? 1 : 0) > width) {
      if (line) lines.push(line);
      line = word.length > width ? word.slice(0, width - 1) + '\u2026' : word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

export default class Table {
  constructor({ head = [], colWidths = [], wordWrap = false } = {}) {
    this.head = head;
    // Inner width = colWidth - 2 (for padding spaces on each side)
    this.colWidths = colWidths;
    this.wordWrap = wordWrap;
    this.rows = [];
  }

  push(row) {
    this.rows.push(row);
  }

  toString() {
    const widths = this.colWidths.map(w => Math.max(w - 2, 1));

    const hLine = (left, mid, right, fill = '\u2500') =>
      left + widths.map(w => fill.repeat(w + 2)).join(mid) + right;

    const top    = hLine('\u250c', '\u252c', '\u2510');
    const sep    = hLine('\u251c', '\u253c', '\u2524');
    const bottom = hLine('\u2514', '\u2534', '\u2518');

    const formatRow = (cells) => {
      if (this.wordWrap) {
        // Multi-line support: wrap each cell, then zip lines
        const wrapped = cells.map((cell, i) => wrap(String(cell), widths[i]));
        const maxLines = Math.max(...wrapped.map(w => w.length));
        const lines = [];
        for (let l = 0; l < maxLines; l++) {
          const parts = wrapped.map((w, i) => {
            const text = l < w.length ? w[l] : '';
            return ' ' + fit(text, widths[i]) + ' ';
          });
          lines.push('\u2502' + parts.join('\u2502') + '\u2502');
        }
        return lines.join('\n');
      }
      const parts = cells.map((cell, i) => ' ' + fit(String(cell), widths[i]) + ' ');
      return '\u2502' + parts.join('\u2502') + '\u2502';
    };

    const out = [top];

    if (this.head.length > 0) {
      out.push(formatRow(this.head));
      out.push(sep);
    }

    for (const row of this.rows) {
      out.push(formatRow(row));
    }

    out.push(bottom);
    return out.join('\n');
  }
}
