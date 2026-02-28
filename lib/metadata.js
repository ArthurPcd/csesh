/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

/**
 * Sidecar metadata management — custom titles, tags, favorites, notes.
 * Stored in metadata.json (never modifies original JSONL files).
 */

import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { TOOL_DIR } from './utils.js';

const METADATA_FILE = join(TOOL_DIR, 'metadata.json');

let memoryMeta = null;

function emptyMetadata() {
  return { version: 1, sessions: {}, globalTags: [] };
}

export async function loadMetadata() {
  if (memoryMeta) return memoryMeta;
  try {
    const data = await readFile(METADATA_FILE, 'utf-8');
    memoryMeta = JSON.parse(data);
  } catch {
    memoryMeta = emptyMetadata();
  }
  return memoryMeta;
}

export async function saveMetadata(meta) {
  await mkdir(dirname(METADATA_FILE), { recursive: true });
  const tmp = METADATA_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  await rename(tmp, METADATA_FILE);
  memoryMeta = meta;
}

function ensureSession(meta, id) {
  if (!meta.sessions[id]) {
    meta.sessions[id] = { updatedAt: new Date().toISOString() };
  }
  return meta.sessions[id];
}

export async function setTitle(id, title) {
  const meta = await loadMetadata();
  const s = ensureSession(meta, id);
  s.customTitle = title;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta);
}

export async function addTag(id, tag) {
  const meta = await loadMetadata();
  const s = ensureSession(meta, id);
  if (!s.tags) s.tags = [];
  tag = tag.toLowerCase().trim();
  if (!s.tags.includes(tag)) {
    s.tags.push(tag);
    s.updatedAt = new Date().toISOString();
    // Also add to globalTags
    if (!meta.globalTags.includes(tag)) meta.globalTags.push(tag);
    await saveMetadata(meta);
  }
}

export async function removeTag(id, tag) {
  const meta = await loadMetadata();
  const s = meta.sessions[id];
  if (!s?.tags) return;
  tag = tag.toLowerCase().trim();
  s.tags = s.tags.filter(t => t !== tag);
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta);
}

export async function toggleFavorite(id) {
  const meta = await loadMetadata();
  const s = ensureSession(meta, id);
  s.favorite = !s.favorite;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta);
  return s.favorite;
}

export async function setNote(id, note) {
  const meta = await loadMetadata();
  const s = ensureSession(meta, id);
  s.notes = note;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta);
}

export async function setTierOverride(id, tier) {
  const meta = await loadMetadata();
  const s = ensureSession(meta, id);
  s.tierOverride = tier;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta);
}

export async function getSessionMeta(id) {
  const meta = await loadMetadata();
  return meta.sessions[id] || null;
}

export async function getAllTags() {
  const meta = await loadMetadata();
  const tagSet = new Set(meta.globalTags || []);
  for (const s of Object.values(meta.sessions)) {
    if (s.tags) s.tags.forEach(t => tagSet.add(t));
  }
  return [...tagSet].sort();
}

export async function batchSetTag(ids, tag) {
  const meta = await loadMetadata();
  tag = tag.toLowerCase().trim();
  for (const id of ids) {
    const s = ensureSession(meta, id);
    if (!s.tags) s.tags = [];
    if (!s.tags.includes(tag)) s.tags.push(tag);
    s.updatedAt = new Date().toISOString();
  }
  if (!meta.globalTags.includes(tag)) meta.globalTags.push(tag);
  await saveMetadata(meta);
}

/**
 * Merge metadata into session summaries.
 * Mutates sessions in-place.
 */
export async function mergeMetadata(sessions) {
  const meta = await loadMetadata();
  for (const session of sessions) {
    const sm = meta.sessions[session.id];
    if (sm) {
      session.customTitle = sm.customTitle || null;
      session.displayTitle = sm.customTitle || session.title;
      session.tags = sm.tags || [];
      session.favorite = sm.favorite || false;
      session.notes = sm.notes || '';
      if (sm.tierOverride != null) session.tierOverride = sm.tierOverride;
    } else {
      session.customTitle = null;
      session.displayTitle = session.title;
      session.tags = [];
      session.favorite = false;
      session.notes = '';
    }
  }
}
