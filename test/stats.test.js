/**
 * Tests for computeStats aggregation logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../lib/stats.js';

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
    firstTimestamp: '2026-02-20T10:00:00Z',
    lastTimestamp: '2026-02-20T10:02:00Z',
    models: ['claude-sonnet-4-6'],
    tokenUsage: { input: 5000, output: 2000, cacheRead: 1000, cacheWrite: 500 },
    toolUsage: { Read: 3, Write: 1 },
    language: 'javascript',
    autoTags: ['refactor'],
    tags: ['important'],
    favorite: false,
    thinkingBlocks: 1,
    filesMentioned: ['src/index.js', 'src/utils.js'],
    ...overrides,
  };
}

function makeSessions(count, overridesFn = () => ({})) {
  return Array.from({ length: count }, (_, i) => makeSession({
    id: `sess-${String(i).padStart(3, '0')}`,
    ...overridesFn(i),
  }));
}

// ── Basic aggregation ────────────────────────────────────────────────

describe('computeStats — basic', () => {
  it('should count total sessions', () => {
    const sessions = makeSessions(5);
    const stats = computeStats(sessions);
    assert.equal(stats.totalSessions, 5);
  });

  it('should sum total size', () => {
    const sessions = makeSessions(3, () => ({ fileSizeBytes: 1000 }));
    const stats = computeStats(sessions);
    assert.equal(stats.totalSize, 3000);
  });

  it('should format total size', () => {
    const sessions = makeSessions(1, () => ({ fileSizeBytes: 2048 }));
    const stats = computeStats(sessions);
    assert.equal(stats.totalSizeFormatted, '2.0 KB');
  });

  it('should sum user and assistant messages', () => {
    const sessions = makeSessions(2, () => ({
      userMessageCount: 5,
      assistantMessageCount: 3,
    }));
    const stats = computeStats(sessions);
    assert.equal(stats.totalUserMessages, 10);
    assert.equal(stats.totalAssistantMessages, 6);
  });
});

// ── Tier distribution ────────────────────────────────────────────────

describe('computeStats — tier distribution', () => {
  it('should count sessions by tier', () => {
    const sessions = [
      makeSession({ tier: 1, junkScore: 1.0 }),
      makeSession({ tier: 1, junkScore: 1.0 }),
      makeSession({ tier: 2, junkScore: 0.7 }),
      makeSession({ tier: 3, junkScore: 0.4 }),
      makeSession({ tier: 4, junkScore: 0.1 }),
      makeSession({ tier: 4, junkScore: 0.1 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.tierDistribution[1], 2);
    assert.equal(stats.tierDistribution[2], 1);
    assert.equal(stats.tierDistribution[3], 1);
    assert.equal(stats.tierDistribution[4], 2);
  });

  it('should compute backward-compatible junk categories', () => {
    const sessions = [
      makeSession({ junkScore: 1.0 }),   // junk
      makeSession({ junkScore: 0.7 }),   // junk
      makeSession({ junkScore: 0.4 }),   // maybe
      makeSession({ junkScore: 0.1 }),   // real
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.categories.junk, 2);
    assert.equal(stats.categories.maybe, 1);
    assert.equal(stats.categories.real, 1);
  });
});

// ── Token aggregation ────────────────────────────────────────────────

describe('computeStats — tokens', () => {
  it('should sum all token types', () => {
    const sessions = [
      makeSession({ tokenUsage: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 } }),
      makeSession({ tokenUsage: { input: 3000, output: 1500, cacheRead: 800, cacheWrite: 400 } }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.tokens.input, 4000);
    assert.equal(stats.tokens.output, 2000);
    assert.equal(stats.tokens.cacheRead, 1000);
    assert.equal(stats.tokens.cacheWrite, 500);
  });

  it('should compute average tokens per session', () => {
    const sessions = [
      makeSession({ tokenUsage: { input: 1000, output: 1000, cacheRead: 0, cacheWrite: 0 } }),
      makeSession({ tokenUsage: { input: 3000, output: 3000, cacheRead: 0, cacheWrite: 0 } }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.avgTokensPerSession, 4000); // (2000 + 6000) / 2
  });
});

// ── Cost estimation ──────────────────────────────────────────────────

describe('computeStats — cost', () => {
  it('should compute total cost', () => {
    const sessions = makeSessions(1, () => ({
      models: ['claude-sonnet-4-6'],
      tokenUsage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
    }));
    const stats = computeStats(sessions);
    // Sonnet input: $3.0 per million tokens
    assert.equal(stats.totalCost, 3.0);
  });

  it('should compute average cost per session', () => {
    const sessions = [
      makeSession({
        models: ['claude-sonnet-4-6'],
        tokenUsage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      makeSession({
        models: ['claude-sonnet-4-6'],
        tokenUsage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.avgCostPerSession, 3.0);
  });

  it('should compute cost by day', () => {
    const sessions = [
      makeSession({
        firstTimestamp: '2026-02-20T10:00:00Z',
        models: ['claude-sonnet-4-6'],
        tokenUsage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
      makeSession({
        firstTimestamp: '2026-02-21T10:00:00Z',
        models: ['claude-sonnet-4-6'],
        tokenUsage: { input: 2_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.costByDay['2026-02-20'], 3.0);
    assert.equal(stats.costByDay['2026-02-21'], 6.0);
  });
});

// ── Model distribution ───────────────────────────────────────────────

describe('computeStats — models', () => {
  it('should count model usage across sessions', () => {
    const sessions = [
      makeSession({ models: ['claude-sonnet-4-6'] }),
      makeSession({ models: ['claude-sonnet-4-6'] }),
      makeSession({ models: ['claude-opus-4-6'] }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.modelCounts['claude-sonnet-4-6'], 2);
    assert.equal(stats.modelCounts['claude-opus-4-6'], 1);
  });
});

// ── Activity by day ──────────────────────────────────────────────────

describe('computeStats — activity by day', () => {
  it('should group sessions and messages by day', () => {
    const sessions = [
      makeSession({ firstTimestamp: '2026-02-20T10:00:00Z', userMessageCount: 3, assistantMessageCount: 2 }),
      makeSession({ firstTimestamp: '2026-02-20T18:00:00Z', userMessageCount: 1, assistantMessageCount: 1 }),
      makeSession({ firstTimestamp: '2026-02-21T09:00:00Z', userMessageCount: 5, assistantMessageCount: 5 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.activityByDay['2026-02-20'].sessions, 2);
    assert.equal(stats.activityByDay['2026-02-20'].messages, 7);
    assert.equal(stats.activityByDay['2026-02-21'].sessions, 1);
    assert.equal(stats.activityByDay['2026-02-21'].messages, 10);
  });

  it('should skip sessions without timestamps', () => {
    const sessions = [
      makeSession({ firstTimestamp: null }),
    ];
    const stats = computeStats(sessions);
    assert.deepEqual(stats.activityByDay, {});
  });
});

// ── Project distribution ─────────────────────────────────────────────

describe('computeStats — projects', () => {
  it('should rank top projects by session count', () => {
    const sessions = [
      makeSession({ shortProject: 'alpha', fileSizeBytes: 1000 }),
      makeSession({ shortProject: 'alpha', fileSizeBytes: 2000 }),
      makeSession({ shortProject: 'beta', fileSizeBytes: 500 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.topProjects[0].name, 'alpha');
    assert.equal(stats.topProjects[0].sessions, 2);
    assert.equal(stats.topProjects[0].size, 3000);
    assert.equal(stats.topProjects[1].name, 'beta');
    assert.equal(stats.topProjects[1].sessions, 1);
  });

  it('should limit to 15 projects', () => {
    const sessions = makeSessions(20, (i) => ({
      shortProject: `project-${i}`,
    }));
    const stats = computeStats(sessions);
    assert.ok(stats.topProjects.length <= 15);
  });
});

// ── Tool usage ───────────────────────────────────────────────────────

describe('computeStats — tool usage', () => {
  it('should aggregate tool call counts', () => {
    const sessions = [
      makeSession({ toolUsage: { Read: 5, Write: 2 } }),
      makeSession({ toolUsage: { Read: 3, Bash: 1 } }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.toolUsageTotal.Read, 8);
    assert.equal(stats.toolUsageTotal.Write, 2);
    assert.equal(stats.toolUsageTotal.Bash, 1);
  });

  it('should handle sessions without toolUsage', () => {
    const sessions = [
      makeSession({ toolUsage: undefined }),
    ];
    const stats = computeStats(sessions);
    assert.deepEqual(stats.toolUsageTotal, {});
  });
});

// ── Tags ─────────────────────────────────────────────────────────────

describe('computeStats — tags', () => {
  it('should merge autoTags and tags', () => {
    const sessions = [
      makeSession({ autoTags: ['refactor', 'bugfix'], tags: ['important'] }),
      makeSession({ autoTags: ['refactor'], tags: ['urgent'] }),
    ];
    const stats = computeStats(sessions);
    const tagNames = stats.topTags.map(t => t.tag);
    assert.ok(tagNames.includes('refactor'));
    assert.ok(tagNames.includes('bugfix'));
    assert.ok(tagNames.includes('important'));
    assert.ok(tagNames.includes('urgent'));
  });

  it('should count tag frequency', () => {
    const sessions = [
      makeSession({ autoTags: ['refactor'], tags: [] }),
      makeSession({ autoTags: ['refactor'], tags: [] }),
      makeSession({ autoTags: ['bugfix'], tags: [] }),
    ];
    const stats = computeStats(sessions);
    const refactor = stats.topTags.find(t => t.tag === 'refactor');
    assert.equal(refactor.count, 2);
  });
});

// ── Favorites ────────────────────────────────────────────────────────

describe('computeStats — favorites', () => {
  it('should count favorite sessions', () => {
    const sessions = [
      makeSession({ favorite: true }),
      makeSession({ favorite: true }),
      makeSession({ favorite: false }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.favoritesCount, 2);
  });
});

// ── Top files ────────────────────────────────────────────────────────

describe('computeStats — top files', () => {
  it('should rank files by mention count', () => {
    const sessions = [
      makeSession({ filesMentioned: ['a.js', 'b.js'] }),
      makeSession({ filesMentioned: ['a.js', 'c.js'] }),
      makeSession({ filesMentioned: ['a.js'] }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.topFiles[0].file, 'a.js');
    assert.equal(stats.topFiles[0].count, 3);
  });

  it('should fall back to filesTouched', () => {
    const sessions = [
      makeSession({ filesMentioned: undefined, filesTouched: ['x.py'] }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.topFiles[0].file, 'x.py');
  });
});

// ── Thinking ratio ───────────────────────────────────────────────────

describe('computeStats — thinking ratio', () => {
  it('should compute ratio of thinking blocks to assistant messages', () => {
    const sessions = [
      makeSession({ thinkingBlocks: 2, assistantMessageCount: 4 }),
      makeSession({ thinkingBlocks: 0, assistantMessageCount: 4 }),
    ];
    const stats = computeStats(sessions);
    // 2 thinking blocks / 8 assistant messages = 0.25
    assert.equal(stats.thinkingRatio, 0.25);
  });

  it('should be 0 when no assistant messages', () => {
    const sessions = [
      makeSession({ thinkingBlocks: 0, assistantMessageCount: 0 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.thinkingRatio, 0);
  });
});

// ── Duration stats ───────────────────────────────────────────────────

describe('computeStats — duration', () => {
  it('should compute average duration', () => {
    const sessions = [
      makeSession({ durationMs: 60_000 }),
      makeSession({ durationMs: 180_000 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.avgDurationMs, 120_000);
  });

  it('should skip zero-duration sessions in avg', () => {
    const sessions = [
      makeSession({ durationMs: 0 }),
      makeSession({ durationMs: 200_000 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.avgDurationMs, 200_000);
  });
});

// ── Date range ───────────────────────────────────────────────────────

describe('computeStats — date range', () => {
  it('should find first and last dates', () => {
    const sessions = [
      makeSession({ firstTimestamp: '2026-01-15T00:00:00Z' }),
      makeSession({ firstTimestamp: '2026-02-20T00:00:00Z' }),
      makeSession({ firstTimestamp: '2026-01-01T00:00:00Z' }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.firstDate, '2026-01-01T00:00:00Z');
    assert.equal(stats.lastDate, '2026-02-20T00:00:00Z');
  });

  it('should be null when no timestamps', () => {
    const sessions = [makeSession({ firstTimestamp: null })];
    const stats = computeStats(sessions);
    assert.equal(stats.firstDate, null);
    assert.equal(stats.lastDate, null);
  });
});

// ── Junk size ────────────────────────────────────────────────────────

describe('computeStats — junk size', () => {
  it('should sum sizes of tier 1 and tier 2 sessions', () => {
    const sessions = [
      makeSession({ tier: 1, fileSizeBytes: 500 }),
      makeSession({ tier: 2, fileSizeBytes: 1500 }),
      makeSession({ tier: 3, fileSizeBytes: 5000 }),
      makeSession({ tier: 4, fileSizeBytes: 10000 }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.junkSize, 2000);
  });
});

// ── Project filter ───────────────────────────────────────────────────

describe('computeStats — project filter', () => {
  it('should filter by project slug', () => {
    const sessions = [
      makeSession({ slug: 'alpha', shortProject: 'alpha' }),
      makeSession({ slug: 'beta', shortProject: 'beta' }),
    ];
    const stats = computeStats(sessions, 'alpha');
    assert.equal(stats.totalSessions, 1);
  });

  it('should filter by partial shortProject match', () => {
    const sessions = [
      makeSession({ slug: 'my-long-project', shortProject: 'my-long-project' }),
      makeSession({ slug: 'other', shortProject: 'other' }),
    ];
    const stats = computeStats(sessions, 'long');
    assert.equal(stats.totalSessions, 1);
  });
});

// ── Edge: empty input ────────────────────────────────────────────────

describe('computeStats — empty input', () => {
  it('should return zero stats for empty array', () => {
    const stats = computeStats([]);
    assert.equal(stats.totalSessions, 0);
    assert.equal(stats.totalSize, 0);
    assert.equal(stats.totalCost, 0);
    assert.equal(stats.avgTokensPerSession, 0);
    assert.equal(stats.avgMessagesPerSession, 0);
    assert.equal(stats.avgCostPerSession, 0);
    assert.equal(stats.avgDurationMs, 0);
    assert.equal(stats.thinkingRatio, 0);
    assert.equal(stats.favoritesCount, 0);
    assert.deepEqual(stats.topProjects, []);
    assert.deepEqual(stats.topTags, []);
    assert.deepEqual(stats.topFiles, []);
  });
});

// ── Cost by project ─────────────────────────────────────────────────

describe('computeStats — cost by project', () => {
  it('should aggregate cost per project', () => {
    const sessions = [
      makeSession({ shortProject: 'alpha', tokenUsage: { input: 1000000, output: 0, cacheRead: 0, cacheWrite: 0 }, models: ['claude-sonnet-4-6'] }),
      makeSession({ shortProject: 'alpha', tokenUsage: { input: 1000000, output: 0, cacheRead: 0, cacheWrite: 0 }, models: ['claude-sonnet-4-6'] }),
      makeSession({ shortProject: 'beta', tokenUsage: { input: 1000000, output: 0, cacheRead: 0, cacheWrite: 0 }, models: ['claude-sonnet-4-6'] }),
    ];
    const stats = computeStats(sessions);
    // Sonnet input = $3/1M tokens → 1M tokens = $3
    assert.equal(stats.costByProject.alpha, 6);
    assert.equal(stats.costByProject.beta, 3);
  });

  it('should use unknown for sessions without project', () => {
    const sessions = [
      makeSession({ shortProject: undefined }),
    ];
    const stats = computeStats(sessions);
    assert.ok(stats.costByProject.unknown !== undefined);
  });
});

// ── Language distribution ────────────────────────────────────────────

describe('computeStats — language distribution', () => {
  it('should count languages', () => {
    const sessions = [
      makeSession({ language: 'javascript' }),
      makeSession({ language: 'javascript' }),
      makeSession({ language: 'python' }),
      makeSession({ language: null }),
    ];
    const stats = computeStats(sessions);
    assert.equal(stats.languageDistribution.javascript, 2);
    assert.equal(stats.languageDistribution.python, 1);
    assert.equal(stats.languageDistribution[null], undefined);
  });
});
