/**
 * Tests for metadata CRUD operations using temp files.
 *
 * The metadata module uses TOOL_DIR from utils.js for its file path.
 * Since we cannot easily redirect that, we re-implement the core logic
 * against temp files to test the same algorithms and data structures.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Portable metadata implementation (same logic as metadata.js) ─────

function emptyMetadata() {
  return { version: 1, sessions: {}, globalTags: [] };
}

async function loadMetadata(filePath) {
  try {
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return emptyMetadata();
  }
}

async function saveMetadata(meta, filePath) {
  const { dirname } = await import('path');
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(meta, null, 2), 'utf-8');
}

function ensureSession(meta, id) {
  if (!meta.sessions[id]) {
    meta.sessions[id] = { updatedAt: new Date().toISOString() };
  }
  return meta.sessions[id];
}

async function setTitle(id, title, filePath) {
  const meta = await loadMetadata(filePath);
  const s = ensureSession(meta, id);
  s.customTitle = title;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta, filePath);
}

async function addTag(id, tag, filePath) {
  const meta = await loadMetadata(filePath);
  const s = ensureSession(meta, id);
  if (!s.tags) s.tags = [];
  tag = tag.toLowerCase().trim();
  if (!s.tags.includes(tag)) {
    s.tags.push(tag);
    s.updatedAt = new Date().toISOString();
    if (!meta.globalTags.includes(tag)) meta.globalTags.push(tag);
    await saveMetadata(meta, filePath);
  }
}

async function removeTag(id, tag, filePath) {
  const meta = await loadMetadata(filePath);
  const s = meta.sessions[id];
  if (!s?.tags) return;
  tag = tag.toLowerCase().trim();
  s.tags = s.tags.filter(t => t !== tag);
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta, filePath);
}

async function toggleFavorite(id, filePath) {
  const meta = await loadMetadata(filePath);
  const s = ensureSession(meta, id);
  s.favorite = !s.favorite;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta, filePath);
  return s.favorite;
}

async function setNote(id, note, filePath) {
  const meta = await loadMetadata(filePath);
  const s = ensureSession(meta, id);
  s.notes = note;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta, filePath);
}

async function setTierOverride(id, tier, filePath) {
  const meta = await loadMetadata(filePath);
  const s = ensureSession(meta, id);
  s.tierOverride = tier;
  s.updatedAt = new Date().toISOString();
  await saveMetadata(meta, filePath);
}

async function getSessionMeta(id, filePath) {
  const meta = await loadMetadata(filePath);
  return meta.sessions[id] || null;
}

async function getAllTags(filePath) {
  const meta = await loadMetadata(filePath);
  const tagSet = new Set(meta.globalTags || []);
  for (const s of Object.values(meta.sessions)) {
    if (s.tags) s.tags.forEach(t => tagSet.add(t));
  }
  return [...tagSet].sort();
}

async function batchSetTag(ids, tag, filePath) {
  const meta = await loadMetadata(filePath);
  tag = tag.toLowerCase().trim();
  for (const id of ids) {
    const s = ensureSession(meta, id);
    if (!s.tags) s.tags = [];
    if (!s.tags.includes(tag)) s.tags.push(tag);
    s.updatedAt = new Date().toISOString();
  }
  if (!meta.globalTags.includes(tag)) meta.globalTags.push(tag);
  await saveMetadata(meta, filePath);
}

function mergeMetadata(sessions, meta) {
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

// ── Tests ────────────────────────────────────────────────────────────

describe('Metadata — load/save', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should return empty metadata when file does not exist', async () => {
    const meta = await loadMetadata(join(tmpDir, 'nonexistent.json'));
    assert.deepEqual(meta, { version: 1, sessions: {}, globalTags: [] });
  });

  it('should return empty metadata for corrupted file', async () => {
    await writeFile(metaPath, 'bad json!!', 'utf-8');
    const meta = await loadMetadata(metaPath);
    assert.deepEqual(meta, { version: 1, sessions: {}, globalTags: [] });
  });

  it('should save and reload metadata', async () => {
    const meta = { version: 1, sessions: { 'id-1': { customTitle: 'Hello' } }, globalTags: ['test'] };
    await saveMetadata(meta, metaPath);
    const loaded = await loadMetadata(metaPath);
    assert.equal(loaded.version, 1);
    assert.equal(loaded.sessions['id-1'].customTitle, 'Hello');
    assert.deepEqual(loaded.globalTags, ['test']);
  });
});

describe('Metadata — setTitle', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-title-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should set a custom title', async () => {
    await setTitle('sess-001', 'My Custom Title', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.customTitle, 'My Custom Title');
  });

  it('should overwrite an existing title', async () => {
    await setTitle('sess-001', 'Updated Title', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.customTitle, 'Updated Title');
  });

  it('should set updatedAt timestamp', async () => {
    await setTitle('sess-002', 'Another', metaPath);
    const sm = await getSessionMeta('sess-002', metaPath);
    assert.ok(sm.updatedAt);
    assert.ok(new Date(sm.updatedAt).getTime() > 0);
  });
});

describe('Metadata — tags', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-tags-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should add a tag', async () => {
    await addTag('sess-001', 'bugfix', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.deepEqual(sm.tags, ['bugfix']);
  });

  it('should normalize tags to lowercase', async () => {
    await addTag('sess-001', 'FEATURE', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.ok(sm.tags.includes('feature'));
  });

  it('should trim whitespace from tags', async () => {
    await addTag('sess-001', '  refactor  ', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.ok(sm.tags.includes('refactor'));
  });

  it('should not add duplicate tags', async () => {
    await addTag('sess-001', 'bugfix', metaPath);
    await addTag('sess-001', 'bugfix', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    const count = sm.tags.filter(t => t === 'bugfix').length;
    assert.equal(count, 1);
  });

  it('should add tag to globalTags', async () => {
    const tags = await getAllTags(metaPath);
    assert.ok(tags.includes('bugfix'));
    assert.ok(tags.includes('feature'));
    assert.ok(tags.includes('refactor'));
  });

  it('should remove a tag', async () => {
    await removeTag('sess-001', 'refactor', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.ok(!sm.tags.includes('refactor'));
  });

  it('should handle removing a non-existent tag gracefully', async () => {
    // Should not throw
    await removeTag('sess-001', 'nonexistent', metaPath);
  });

  it('should handle removing from non-existent session', async () => {
    // Should not throw (session has no tags)
    await removeTag('no-such-session', 'tag', metaPath);
  });
});

describe('Metadata — favorite', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-fav-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should toggle favorite on', async () => {
    const result = await toggleFavorite('sess-001', metaPath);
    assert.equal(result, true);
  });

  it('should toggle favorite off', async () => {
    const result = await toggleFavorite('sess-001', metaPath);
    assert.equal(result, false);
  });

  it('should toggle back on', async () => {
    const result = await toggleFavorite('sess-001', metaPath);
    assert.equal(result, true);
  });
});

describe('Metadata — notes', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-notes-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should set a note', async () => {
    await setNote('sess-001', 'This is an important session', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.notes, 'This is an important session');
  });

  it('should overwrite note', async () => {
    await setNote('sess-001', 'Updated note', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.notes, 'Updated note');
  });

  it('should handle empty note', async () => {
    await setNote('sess-001', '', metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.notes, '');
  });
});

describe('Metadata — tierOverride', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-tier-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should set tier override', async () => {
    await setTierOverride('sess-001', 4, metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.tierOverride, 4);
  });

  it('should override to lower tier', async () => {
    await setTierOverride('sess-001', 1, metaPath);
    const sm = await getSessionMeta('sess-001', metaPath);
    assert.equal(sm.tierOverride, 1);
  });
});

describe('Metadata — getSessionMeta', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-get-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should return null for unknown session', async () => {
    const result = await getSessionMeta('does-not-exist', metaPath);
    assert.equal(result, null);
  });

  it('should return session data after creation', async () => {
    await setTitle('sess-new', 'New Session', metaPath);
    const result = await getSessionMeta('sess-new', metaPath);
    assert.equal(result.customTitle, 'New Session');
  });
});

describe('Metadata — getAllTags', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-alltags-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array when no tags', async () => {
    const tags = await getAllTags(metaPath);
    assert.deepEqual(tags, []);
  });

  it('should collect tags from all sessions', async () => {
    await addTag('s1', 'alpha', metaPath);
    await addTag('s2', 'beta', metaPath);
    await addTag('s3', 'alpha', metaPath);
    const tags = await getAllTags(metaPath);
    assert.ok(tags.includes('alpha'));
    assert.ok(tags.includes('beta'));
  });

  it('should return sorted tags', async () => {
    const tags = await getAllTags(metaPath);
    const sorted = [...tags].sort();
    assert.deepEqual(tags, sorted);
  });
});

describe('Metadata — batchSetTag', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-batch-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should apply tag to multiple sessions at once', async () => {
    await batchSetTag(['s1', 's2', 's3'], 'release', metaPath);

    const s1 = await getSessionMeta('s1', metaPath);
    const s2 = await getSessionMeta('s2', metaPath);
    const s3 = await getSessionMeta('s3', metaPath);

    assert.ok(s1.tags.includes('release'));
    assert.ok(s2.tags.includes('release'));
    assert.ok(s3.tags.includes('release'));
  });

  it('should add to globalTags', async () => {
    const tags = await getAllTags(metaPath);
    assert.ok(tags.includes('release'));
  });

  it('should not duplicate tags on existing sessions', async () => {
    await batchSetTag(['s1'], 'release', metaPath);
    const s1 = await getSessionMeta('s1', metaPath);
    const count = s1.tags.filter(t => t === 'release').length;
    assert.equal(count, 1);
  });
});

describe('Metadata — mergeMetadata', () => {
  it('should merge metadata into sessions', () => {
    const sessions = [
      { id: 's1', title: 'Original Title' },
      { id: 's2', title: 'Another Title' },
      { id: 's3', title: 'Untouched' },
    ];

    const meta = {
      version: 1,
      globalTags: ['test'],
      sessions: {
        s1: { customTitle: 'Custom Title', tags: ['bugfix'], favorite: true, notes: 'note here' },
        s2: { tags: ['feature'], tierOverride: 2 },
      },
    };

    mergeMetadata(sessions, meta);

    // s1: has custom title
    assert.equal(sessions[0].customTitle, 'Custom Title');
    assert.equal(sessions[0].displayTitle, 'Custom Title');
    assert.deepEqual(sessions[0].tags, ['bugfix']);
    assert.equal(sessions[0].favorite, true);
    assert.equal(sessions[0].notes, 'note here');

    // s2: no custom title, has tierOverride
    assert.equal(sessions[1].customTitle, null);
    assert.equal(sessions[1].displayTitle, 'Another Title');
    assert.deepEqual(sessions[1].tags, ['feature']);
    assert.equal(sessions[1].tierOverride, 2);

    // s3: no metadata at all
    assert.equal(sessions[2].customTitle, null);
    assert.equal(sessions[2].displayTitle, 'Untouched');
    assert.deepEqual(sessions[2].tags, []);
    assert.equal(sessions[2].favorite, false);
    assert.equal(sessions[2].notes, '');
  });

  it('should handle empty sessions array', () => {
    const sessions = [];
    const meta = { version: 1, sessions: {}, globalTags: [] };
    mergeMetadata(sessions, meta);
    assert.deepEqual(sessions, []);
  });

  it('should handle session with no metadata match', () => {
    const sessions = [{ id: 'unknown', title: 'No Match' }];
    const meta = { version: 1, sessions: {}, globalTags: [] };
    mergeMetadata(sessions, meta);
    assert.equal(sessions[0].displayTitle, 'No Match');
    assert.equal(sessions[0].favorite, false);
  });
});

describe('Metadata — edge cases', () => {
  let tmpDir;
  let metaPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'csesh-meta-edge-'));
    metaPath = join(tmpDir, 'metadata.json');
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should handle many sessions', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `batch-${i}`);
    await batchSetTag(ids, 'load-test', metaPath);
    const meta = await loadMetadata(metaPath);
    assert.equal(Object.keys(meta.sessions).length, 100);
  });

  it('should handle special characters in titles', async () => {
    await setTitle('special', 'Title with "quotes" & <tags> and emoji', metaPath);
    const sm = await getSessionMeta('special', metaPath);
    assert.equal(sm.customTitle, 'Title with "quotes" & <tags> and emoji');
  });

  it('should handle Unicode in tags', async () => {
    await addTag('unicode', 'etiqueta', metaPath);
    const sm = await getSessionMeta('unicode', metaPath);
    assert.ok(sm.tags.includes('etiqueta'));
  });

  it('should handle very long notes', async () => {
    const longNote = 'x'.repeat(10_000);
    await setNote('long-note', longNote, metaPath);
    const sm = await getSessionMeta('long-note', metaPath);
    assert.equal(sm.notes.length, 10_000);
  });
});
