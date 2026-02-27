/**
 * Tests for filterSessions search/filter logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterSessions } from '../lib/search.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    id: 'sess-001',
    slug: 'myproject',
    shortProject: 'myproject',
    project: '/Users/dev/myproject',
    category: 'conversation',
    fileSizeBytes: 10_000,
    userMessageCount: 3,
    assistantMessageCount: 4,
    durationMs: 120_000,
    junkScore: 0.1,
    tier: 4,
    title: 'Fix the widget component',
    displayTitle: 'Fix the widget component',
    firstTimestamp: '2026-02-20T10:00:00Z',
    lastTimestamp: '2026-02-20T10:02:00Z',
    cwd: '/Users/dev/myproject',
    gitBranch: 'main',
    tags: [],
    autoTags: [],
    notes: '',
    favorite: false,
    ...overrides,
  };
}

function makeSessions() {
  return [
    makeSession({
      id: 's1',
      slug: 'alpha',
      shortProject: 'alpha',
      project: '/Users/dev/alpha',
      title: 'Implement auth module',
      displayTitle: 'Implement auth module',
      tier: 4,
      junkScore: 0.1,
      fileSizeBytes: 50_000,
      userMessageCount: 10,
      assistantMessageCount: 12,
      firstTimestamp: '2026-02-15T08:00:00Z',
      lastTimestamp: '2026-02-15T09:00:00Z',
      tags: ['auth', 'security'],
      autoTags: ['feature'],
      favorite: true,
      notes: 'Key auth implementation',
    }),
    makeSession({
      id: 's2',
      slug: 'alpha',
      shortProject: 'alpha',
      project: '/Users/dev/alpha',
      title: 'Fix CSS bug',
      displayTitle: 'Fix CSS bug',
      tier: 2,
      junkScore: 0.7,
      fileSizeBytes: 2_000,
      userMessageCount: 1,
      assistantMessageCount: 1,
      firstTimestamp: '2026-02-18T14:00:00Z',
      lastTimestamp: '2026-02-18T14:01:00Z',
      tags: [],
      autoTags: ['bugfix'],
    }),
    makeSession({
      id: 's3',
      slug: 'beta',
      shortProject: 'beta',
      project: '/Users/dev/beta',
      title: 'Setup CI pipeline',
      displayTitle: 'Setup CI pipeline',
      tier: 3,
      junkScore: 0.4,
      fileSizeBytes: 8_000,
      userMessageCount: 2,
      assistantMessageCount: 3,
      firstTimestamp: '2026-02-20T10:00:00Z',
      lastTimestamp: '2026-02-20T10:05:00Z',
      tags: ['devops'],
      autoTags: [],
      gitBranch: 'feat/ci',
    }),
    makeSession({
      id: 's4',
      slug: 'beta',
      shortProject: 'beta',
      project: '/Users/dev/beta',
      title: null,
      displayTitle: '(no title)',
      category: 'empty',
      tier: 1,
      junkScore: 1.0,
      fileSizeBytes: 100,
      userMessageCount: 0,
      assistantMessageCount: 0,
      firstTimestamp: '2026-02-10T05:00:00Z',
      lastTimestamp: '2026-02-10T05:00:00Z',
    }),
  ];
}

// ── No filters ───────────────────────────────────────────────────────

describe('filterSessions — no filters', () => {
  it('should return all sessions sorted by date (newest first)', () => {
    const result = filterSessions(makeSessions());
    assert.equal(result.total, 4);
    assert.equal(result.sessions.length, 4);
    assert.equal(result.sessions[0].id, 's3'); // Feb 20
    assert.equal(result.sessions[1].id, 's2'); // Feb 18
  });
});

// ── Project filter ───────────────────────────────────────────────────

describe('filterSessions — project', () => {
  it('should filter by exact slug', () => {
    const result = filterSessions(makeSessions(), { project: 'alpha' });
    assert.equal(result.total, 2);
    assert.ok(result.sessions.every(s => s.slug === 'alpha'));
  });

  it('should filter by partial shortProject (case-insensitive)', () => {
    const result = filterSessions(makeSessions(), { project: 'BET' });
    assert.equal(result.total, 2);
    assert.ok(result.sessions.every(s => s.shortProject === 'beta'));
  });

  it('should filter by full project path', () => {
    const result = filterSessions(makeSessions(), { project: '/Users/dev/alpha' });
    assert.equal(result.total, 2);
  });

  it('should return empty for non-matching project', () => {
    const result = filterSessions(makeSessions(), { project: 'nonexistent' });
    assert.equal(result.total, 0);
    assert.deepEqual(result.sessions, []);
  });
});

// ── Tier filter ──────────────────────────────────────────────────────

describe('filterSessions — tier', () => {
  it('should filter by tier number', () => {
    const result = filterSessions(makeSessions(), { tier: 4 });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should accept tier as string', () => {
    const result = filterSessions(makeSessions(), { tier: '1' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].tier, 1);
  });
});

// ── Category filter (backward compat) ────────────────────────────────

describe('filterSessions — category', () => {
  it('should filter by "junk" label', () => {
    const result = filterSessions(makeSessions(), { category: 'junk' });
    // junk = junkScore >= 0.6 => s2 (0.7) and s4 (1.0)
    assert.equal(result.total, 2);
  });

  it('should filter by "real" label', () => {
    const result = filterSessions(makeSessions(), { category: 'real' });
    // real = junkScore < 0.3 => s1 (0.1)
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should filter by "maybe" label', () => {
    const result = filterSessions(makeSessions(), { category: 'maybe' });
    // maybe = 0.3 <= junkScore < 0.6 => s3 (0.4)
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's3');
  });

  it('should filter by tier-based category names', () => {
    assert.equal(filterSessions(makeSessions(), { category: 'keep' }).total, 1);
    assert.equal(filterSessions(makeSessions(), { category: 'review' }).total, 1);
    assert.equal(filterSessions(makeSessions(), { category: 'suggested' }).total, 1);
    assert.equal(filterSessions(makeSessions(), { category: 'auto-delete' }).total, 1);
  });

  it('should filter by raw category', () => {
    const result = filterSessions(makeSessions(), { category: 'empty' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's4');
  });
});

// ── Tag filter ───────────────────────────────────────────────────────

describe('filterSessions — tag', () => {
  it('should filter by user tag', () => {
    const result = filterSessions(makeSessions(), { tag: 'auth' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should filter by auto tag', () => {
    const result = filterSessions(makeSessions(), { tag: 'bugfix' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's2');
  });

  it('should be case-insensitive', () => {
    const result = filterSessions(makeSessions(), { tag: 'DEVOPS' });
    // The filter lowercases the tag and checks s.tags which are lowercase
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's3');
  });
});

// ── Favorite filter ──────────────────────────────────────────────────

describe('filterSessions — favorite', () => {
  it('should filter to favorites only', () => {
    const result = filterSessions(makeSessions(), { favorite: true });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should show all when favorite is false/null', () => {
    const result = filterSessions(makeSessions(), { favorite: false });
    assert.equal(result.total, 4);
  });
});

// ── Date range filter ────────────────────────────────────────────────

describe('filterSessions — date range', () => {
  it('should filter from date', () => {
    const result = filterSessions(makeSessions(), { from: '2026-02-18' });
    assert.equal(result.total, 2); // s2 (Feb 18) and s3 (Feb 20)
  });

  it('should filter to date', () => {
    const result = filterSessions(makeSessions(), { to: '2026-02-15' });
    assert.equal(result.total, 2); // s1 (Feb 15) and s4 (Feb 10)
  });

  it('should filter with both from and to', () => {
    const result = filterSessions(makeSessions(), { from: '2026-02-15', to: '2026-02-18' });
    assert.equal(result.total, 2); // s1 (Feb 15) and s2 (Feb 18)
  });

  it('should return empty for out-of-range dates', () => {
    const result = filterSessions(makeSessions(), { from: '2026-03-01' });
    assert.equal(result.total, 0);
  });
});

// ── Text search ──────────────────────────────────────────────────────

describe('filterSessions — query (text search)', () => {
  it('should match title', () => {
    const result = filterSessions(makeSessions(), { query: 'auth' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should match project', () => {
    const result = filterSessions(makeSessions(), { query: 'alpha' });
    assert.equal(result.total, 2);
  });

  it('should match git branch', () => {
    const result = filterSessions(makeSessions(), { query: 'feat/ci' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's3');
  });

  it('should match session id', () => {
    const result = filterSessions(makeSessions(), { query: 's4' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's4');
  });

  it('should match tags', () => {
    const result = filterSessions(makeSessions(), { query: 'security' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should match notes', () => {
    const result = filterSessions(makeSessions(), { query: 'Key auth' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should be case-insensitive', () => {
    const result = filterSessions(makeSessions(), { query: 'CSS' });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's2');
  });

  it('should return empty for non-matching query', () => {
    const result = filterSessions(makeSessions(), { query: 'zzzznotfound' });
    assert.equal(result.total, 0);
  });
});

// ── Sorting ──────────────────────────────────────────────────────────

describe('filterSessions — sort', () => {
  it('should sort by date (default, newest first)', () => {
    const result = filterSessions(makeSessions(), { sort: 'date' });
    const ids = result.sessions.map(s => s.id);
    assert.equal(ids[0], 's3'); // Feb 20
  });

  it('should sort by size (largest first)', () => {
    const result = filterSessions(makeSessions(), { sort: 'size' });
    assert.equal(result.sessions[0].id, 's1'); // 50KB
    assert.equal(result.sessions[result.sessions.length - 1].id, 's4'); // 100B
  });

  it('should sort by messages (most first)', () => {
    const result = filterSessions(makeSessions(), { sort: 'messages' });
    assert.equal(result.sessions[0].id, 's1'); // 10 + 12 = 22
  });

  it('should sort by tier (lowest tier first)', () => {
    const result = filterSessions(makeSessions(), { sort: 'tier' });
    assert.equal(result.sessions[0].tier, 1);
    assert.equal(result.sessions[result.sessions.length - 1].tier, 4);
  });

  it('should sort by project name', () => {
    const result = filterSessions(makeSessions(), { sort: 'project' });
    assert.equal(result.sessions[0].shortProject, 'alpha');
  });

  it('should sort by title', () => {
    const result = filterSessions(makeSessions(), { sort: 'title' });
    // (no title) < Fix CSS bug < Fix the widget... < Implement auth... < Setup CI...
    assert.ok(result.sessions[0].displayTitle <= result.sessions[1].displayTitle);
  });
});

// ── Pagination ───────────────────────────────────────────────────────

describe('filterSessions — pagination', () => {
  it('should limit results', () => {
    const result = filterSessions(makeSessions(), { limit: 2 });
    assert.equal(result.total, 4);
    assert.equal(result.sessions.length, 2);
  });

  it('should offset results', () => {
    const result = filterSessions(makeSessions(), { offset: 2 });
    assert.equal(result.total, 4);
    assert.equal(result.sessions.length, 2);
  });

  it('should apply offset then limit', () => {
    const result = filterSessions(makeSessions(), { offset: 1, limit: 2 });
    assert.equal(result.total, 4);
    assert.equal(result.sessions.length, 2);
  });

  it('should return empty when offset exceeds total', () => {
    const result = filterSessions(makeSessions(), { offset: 100 });
    assert.equal(result.sessions.length, 0);
  });
});

// ── Combined filters ─────────────────────────────────────────────────

describe('filterSessions — combined filters', () => {
  it('should apply project + tier', () => {
    const result = filterSessions(makeSessions(), { project: 'alpha', tier: 4 });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('should apply project + query + limit', () => {
    const result = filterSessions(makeSessions(), { project: 'alpha', query: 'auth', limit: 1 });
    assert.equal(result.total, 1);
    assert.equal(result.sessions[0].id, 's1');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe('filterSessions — edge cases', () => {
  it('should handle empty sessions array', () => {
    const result = filterSessions([]);
    assert.equal(result.total, 0);
    assert.deepEqual(result.sessions, []);
  });

  it('should handle session with all null fields in query search', () => {
    const sessions = [makeSession({
      id: 'x',
      title: null,
      displayTitle: null,
      project: null,
      shortProject: null,
      cwd: null,
      gitBranch: null,
      tags: null,
      autoTags: null,
      notes: null,
    })];
    // Should not throw
    const result = filterSessions(sessions, { query: 'something' });
    assert.equal(result.total, 0);
  });

  it('should not mutate the original array', () => {
    const sessions = makeSessions();
    const originalOrder = sessions.map(s => s.id);
    filterSessions(sessions, { sort: 'size' });
    assert.deepEqual(sessions.map(s => s.id), originalOrder);
  });

  it('should handle default options', () => {
    const result = filterSessions(makeSessions());
    assert.equal(result.offset, 0);
    assert.equal(result.limit, 0);
  });
});
