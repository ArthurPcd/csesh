/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

import { readFile, writeFile, rename, mkdir, readdir, stat, unlink, rm } from 'fs/promises';
import { join, basename, dirname, relative, isAbsolute, resolve } from 'path';
import { TRASH_DIR, TRASH_MANIFEST, PROJECTS_DIR } from './utils.js';

/**
 * Resolve an originalPath from manifest — handles both old absolute and new relative formats.
 */
function resolveOriginalPath(storedPath) {
  if (isAbsolute(storedPath)) return storedPath; // backward compat: old absolute paths
  return resolve(PROJECTS_DIR, storedPath);
}

/**
 * Load the trash manifest.
 */
async function loadManifest() {
  try {
    const data = await readFile(TRASH_MANIFEST, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { items: [] };
  }
}

/**
 * Save the trash manifest.
 */
async function saveManifest(manifest) {
  await mkdir(TRASH_DIR, { recursive: true });
  await writeFile(TRASH_MANIFEST, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Move a session file to trash.
 */
export async function trashSession(session, reason = 'manual') {
  await mkdir(TRASH_DIR, { recursive: true });

  const fileName = basename(session.filePath);
  const trashPath = join(TRASH_DIR, fileName);

  // Move the file
  await rename(session.filePath, trashPath);

  // Also move the companion directory if it exists (same name without .jsonl)
  const companionDir = session.filePath.replace('.jsonl', '');
  try {
    const dirStat = await stat(companionDir);
    if (dirStat.isDirectory()) {
      const trashCompanion = join(TRASH_DIR, basename(companionDir));
      await rename(companionDir, trashCompanion);
    }
  } catch { /* no companion dir */ }

  // Update manifest — store path relative to projects dir for portability
  const manifest = await loadManifest();
  manifest.items.push({
    id: session.id,
    originalPath: relative(PROJECTS_DIR, session.filePath),
    trashPath,
    trashedAt: new Date().toISOString(),
    reason,
    junkScore: session.junkScore,
    junkReasons: session.junkReasons,
    fileSizeBytes: session.fileSizeBytes,
    title: session.title,
    project: session.shortProject,
  });
  await saveManifest(manifest);

  return { id: session.id, trashPath };
}

/**
 * Restore a session from trash.
 */
export async function restoreSession(id) {
  const manifest = await loadManifest();
  const idx = manifest.items.findIndex(i => i.id === id);
  if (idx === -1) throw new Error(`Session ${id} not found in trash`);

  const item = manifest.items[idx];
  const originalPath = resolveOriginalPath(item.originalPath);

  // Ensure original directory exists
  await mkdir(dirname(originalPath), { recursive: true });

  // Move back
  await rename(item.trashPath, originalPath);

  // Restore companion directory if it exists
  const companionTrash = item.trashPath.replace('.jsonl', '');
  const companionOriginal = originalPath.replace('.jsonl', '');
  try {
    const dirStat = await stat(companionTrash);
    if (dirStat.isDirectory()) {
      await rename(companionTrash, companionOriginal);
    }
  } catch { /* no companion dir */ }

  // Remove from manifest
  manifest.items.splice(idx, 1);
  await saveManifest(manifest);

  return { id, restoredTo: originalPath };
}

/**
 * List all trashed sessions.
 */
export async function listTrash() {
  const manifest = await loadManifest();
  return manifest.items;
}

/**
 * Permanently delete a single session from trash.
 */
export async function deleteFromTrash(id) {
  const manifest = await loadManifest();
  const idx = manifest.items.findIndex(i => i.id === id || i.id.startsWith(id));
  if (idx === -1) throw new Error(`Session ${id} not found in trash`);

  const item = manifest.items[idx];

  // Delete the file
  try { await unlink(item.trashPath); } catch { /* already gone */ }
  // Delete companion directory
  const companion = item.trashPath.replace('.jsonl', '');
  try {
    const dirStat = await stat(companion);
    if (dirStat.isDirectory()) {
      await rm(companion, { recursive: true, force: true });
    }
  } catch { /* no companion */ }

  manifest.items.splice(idx, 1);
  await saveManifest(manifest);

  return { id: item.id, deleted: true };
}

/**
 * Empty trash: remove items older than `olderThanDays` (default 30).
 * Pass olderThanDays=0 to empty everything.
 */
export async function emptyTrash(olderThanDays = 30) {
  const manifest = await loadManifest();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const toRemove = [];
  const toKeep = [];

  for (const item of manifest.items) {
    if (new Date(item.trashedAt).getTime() < cutoff) {
      toRemove.push(item);
    } else {
      toKeep.push(item);
    }
  }

  // Actually delete the files
  for (const item of toRemove) {
    try { await unlink(item.trashPath); } catch { /* already gone */ }
    // Remove companion directory
    const companion = item.trashPath.replace('.jsonl', '');
    try {
      const dirStat = await stat(companion);
      if (dirStat.isDirectory()) {
        await rm(companion, { recursive: true, force: true });
      }
    } catch { /* no companion */ }
  }

  manifest.items = toKeep;
  await saveManifest(manifest);

  return { removed: toRemove.length, remaining: toKeep.length };
}
