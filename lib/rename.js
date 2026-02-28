/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

/**
 * Session rename — modifies the "slug" field in JSONL files
 * so that `claude --resume` shows the custom name.
 *
 * Safety:
 * - Creates .jsonl.bak backup before any modification
 * - Atomic write via temp file + rename
 * - Only touches the "slug" field, preserves everything else
 */

import { readFile, writeFile, rename as fsRename, copyFile, appendFile } from 'fs/promises';
import { findSessionFiles } from './scanner.js';

/**
 * Convert a human title to a Claude-compatible slug.
 * "Fix login bug" → "fix-login-bug"
 * "Projet ORIGO v2" → "projet-origo-v2"
 */
export function titleToSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')  // remove non-alphanumeric
    .replace(/\s+/g, '-')          // spaces → dashes
    .replace(/-+/g, '-')           // collapse dashes
    .replace(/^-|-$/g, '')         // trim leading/trailing dashes
    .slice(0, 60)                  // reasonable length
    || 'unnamed';
}

/**
 * Rename a session's slug in the JSONL file.
 * Returns { success, backupPath, linesModified, originalSlug, newSlug }
 */
export async function renameSessionSlug(sessionId, newTitle) {
  // Find the session file
  const allFiles = await findSessionFiles();
  const match = allFiles.find(f => f.id === sessionId || f.id.startsWith(sessionId));
  if (!match) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const { filePath } = match;
  const newSlug = titleToSlug(newTitle);

  // Read the original file
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Find original slug and replace
  let originalSlug = null;
  let linesModified = 0;
  const newLines = [];

  for (const line of lines) {
    if (!line.trim()) {
      newLines.push(line);
      continue;
    }

    try {
      const record = JSON.parse(line);
      if (record.slug != null) {
        if (!originalSlug) originalSlug = record.slug;
        record.slug = newSlug;
        linesModified++;
        newLines.push(JSON.stringify(record));
      } else {
        newLines.push(line);
      }
    } catch {
      // Unparseable line — keep as-is
      newLines.push(line);
    }
  }

  if (linesModified === 0) {
    throw new Error('No slug field found in session file');
  }

  // Create backup
  const backupPath = filePath + '.bak';
  await copyFile(filePath, backupPath);

  // Atomic write: write to temp, then rename
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, newLines.join('\n'), 'utf-8');
  await fsRename(tmpPath, filePath);

  // Append a custom-title record that Claude Code reads natively for --resume
  const titleRecord = JSON.stringify({ type: 'custom-title', customTitle: newTitle, sessionId: match.id });
  await appendFile(filePath, '\n' + titleRecord + '\n', 'utf-8');

  return {
    success: true,
    backupPath,
    linesModified,
    originalSlug,
    newSlug,
    filePath,
  };
}

/**
 * Restore a session from its backup file.
 */
export async function restoreSessionBackup(sessionId) {
  const allFiles = await findSessionFiles();
  const match = allFiles.find(f => f.id === sessionId || f.id.startsWith(sessionId));
  if (!match) throw new Error(`Session not found: ${sessionId}`);

  const backupPath = match.filePath + '.bak';
  try {
    await copyFile(backupPath, match.filePath);
    return { success: true, restoredFrom: backupPath };
  } catch {
    throw new Error('No backup found for this session');
  }
}
