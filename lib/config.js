/**
 * Claude Sessions Organizer
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/claude-sessions-organizer
 */

/**
 * Configuration loader with sensible defaults.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { TOOL_DIR } from './utils.js';

const DEFAULTS = {
  webPort: 3456,
  scanMode: 'fast',
  defaultSort: 'date',
  pageSize: 50,
};

let cachedConfig = null;

export async function getConfig() {
  if (cachedConfig) return cachedConfig;

  let userConfig = {};
  try {
    const data = await readFile(join(TOOL_DIR, 'config.json'), 'utf-8');
    userConfig = JSON.parse(data);
  } catch {
    // Try default config
    try {
      const data = await readFile(join(TOOL_DIR, 'config.default.json'), 'utf-8');
      userConfig = JSON.parse(data);
    } catch { /* use defaults */ }
  }

  cachedConfig = { ...DEFAULTS, ...userConfig };
  return cachedConfig;
}
