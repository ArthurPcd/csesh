/**
 * Claude Sessions Organizer
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/claude-sessions-organizer
 */

import { readFile, writeFile, stat, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { CACHE_FILE } from './utils.js';

const CACHE_VERSION = 2;
let memoryCache = null;

async function loadCache() {
  if (memoryCache) return memoryCache;
  try {
    const data = await readFile(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Migrate v1 cache — keep entries but they'll be re-scanned for deep analysis
    if (!parsed.version || parsed.version < CACHE_VERSION) {
      parsed.version = CACHE_VERSION;
    }
    memoryCache = parsed;
  } catch {
    memoryCache = { version: CACHE_VERSION, sessions: {} };
  }
  return memoryCache;
}

async function saveCache(cache) {
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache), 'utf-8');
  memoryCache = cache;
}

function isValid(entry, fileInfo) {
  return (
    entry &&
    entry.mtime === fileInfo.mtimeMs &&
    entry.size === fileInfo.size
  );
}

/**
 * Get a session summary from cache, or null if not cached/stale.
 * If requireAnalyzed=true, only return if deep analysis was done.
 */
export async function getCached(filePath, { requireAnalyzed = false } = {}) {
  const cache = await loadCache();
  const entry = cache.sessions[filePath];
  if (!entry) return null;

  if (requireAnalyzed && !entry.data?.analyzed) return null;

  try {
    const fileInfo = await stat(filePath);
    if (isValid(entry, fileInfo)) {
      return entry.data;
    }
  } catch {
    delete cache.sessions[filePath];
  }
  return null;
}

/**
 * Store a session summary in cache.
 */
export async function setCached(filePath, data) {
  const cache = await loadCache();
  try {
    const fileInfo = await stat(filePath);
    cache.sessions[filePath] = {
      mtime: fileInfo.mtimeMs,
      size: fileInfo.size,
      data,
    };
  } catch {
    return;
  }
}

/**
 * Flush in-memory cache to disk.
 */
export async function flushCache() {
  if (memoryCache) {
    await saveCache(memoryCache);
  }
}

/**
 * Clear the entire cache.
 */
export async function clearCache() {
  memoryCache = { version: CACHE_VERSION, sessions: {} };
  await saveCache(memoryCache);
}

/**
 * Get cache stats.
 */
export async function cacheStats() {
  const cache = await loadCache();
  const count = Object.keys(cache.sessions).length;
  const analyzed = Object.values(cache.sessions).filter(e => e.data?.analyzed).length;
  let totalSize = 0;
  try {
    const info = await stat(CACHE_FILE);
    totalSize = info.size;
  } catch { /* no cache file */ }
  return { entries: count, analyzed, diskSize: totalSize };
}
