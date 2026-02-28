/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

/**
 * Native ANSI color library — replaces chalk with zero dependencies.
 * Supports chaining: c.bold.green('text'), c.red('text'), etc.
 * Respects NO_COLOR and FORCE_COLOR environment variables.
 */

const enabled = !process.env.NO_COLOR && (
  process.env.FORCE_COLOR !== '0' &&
  (process.stdout.isTTY || process.env.FORCE_COLOR)
);

const CODES = {
  // modifiers
  bold:    [1, 22],
  dim:     [2, 22],
  // colors
  red:     [31, 39],
  green:   [32, 39],
  yellow:  [33, 39],
  blue:    [34, 39],
  magenta: [35, 39],
  cyan:    [36, 39],
  white:   [37, 39],
};

function build(styles = []) {
  const fn = (str) => {
    if (!enabled || str === '') return String(str);
    let open = '';
    let close = '';
    for (const s of styles) {
      open += `\x1b[${CODES[s][0]}m`;
      close = `\x1b[${CODES[s][1]}m` + close;
    }
    return open + String(str) + close;
  };

  return new Proxy(fn, {
    get(target, prop) {
      if (prop in CODES) return build([...styles, prop]);
      return target[prop];
    },
  });
}

const c = build();
export default c;
