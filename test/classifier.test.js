/**
 * Tests for the 4-tier classification engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify,
  classifyAll,
  tierLabel,
  junkLabel,
  TIER_AUTO_DELETE,
  TIER_SUGGESTED,
  TIER_REVIEW,
  TIER_KEEP,
  TIER_LABELS,
  TIER_COLORS,
} from '../lib/classifier.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    id: 'test-session-001',
    category: 'conversation',
    fileSizeBytes: 10_000,
    userMessageCount: 2,
    assistantMessageCount: 2,
    durationMs: 180_000,
    totalToolCalls: 0,
    turnCount: 0,
    thinkingBlocks: 0,
    uniqueFilesCount: 0,
    title: 'Fix the widget component',
    models: ['claude-sonnet-4-6'],
    tokenUsage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 },
    junkScore: undefined,
    tier: undefined,
    ...overrides,
  };
}

// ── Tier constants ───────────────────────────────────────────────────

describe('Tier constants', () => {
  it('should have correct numeric values', () => {
    assert.equal(TIER_AUTO_DELETE, 1);
    assert.equal(TIER_SUGGESTED, 2);
    assert.equal(TIER_REVIEW, 3);
    assert.equal(TIER_KEEP, 4);
  });

  it('should have labels for all tiers', () => {
    assert.equal(TIER_LABELS[1], 'auto-delete');
    assert.equal(TIER_LABELS[2], 'suggested-delete');
    assert.equal(TIER_LABELS[3], 'review');
    assert.equal(TIER_LABELS[4], 'keep');
  });

  it('should have colors for all tiers', () => {
    assert.equal(TIER_COLORS[1], 'red');
    assert.equal(TIER_COLORS[2], 'yellow');
    assert.equal(TIER_COLORS[3], 'blue');
    assert.equal(TIER_COLORS[4], 'green');
  });
});

// ── Tier 1: AUTO-DELETE ──────────────────────────────────────────────

describe('Tier 1 — AUTO-DELETE', () => {
  it('should classify empty sessions', () => {
    const s = classify(makeSession({ category: 'empty' }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
    assert.equal(s.tierLabel, 'auto-delete');
    assert.ok(s.junkReasons.some(r => r.includes('empty')));
  });

  it('should classify hook-only sessions', () => {
    const s = classify(makeSession({ category: 'hook-only' }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
    assert.ok(s.junkReasons.some(r => r.includes('hook-only')));
  });

  it('should classify snapshot-only sessions', () => {
    const s = classify(makeSession({ category: 'snapshot-only' }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
    assert.ok(s.junkReasons.some(r => r.includes('snapshot-only')));
  });

  it('should classify tiny files with no user messages', () => {
    const s = classify(makeSession({ fileSizeBytes: 512, userMessageCount: 0 }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
    assert.ok(s.junkReasons.some(r => r.includes('tiny file')));
  });

  it('should classify minimal records with no user messages', () => {
    const s = classify(makeSession({
      totalRecordCount: 2,
      userMessageCount: 0,
      fileSizeBytes: 2000,
    }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
    assert.ok(s.junkReasons.some(r => r.includes('minimal records')));
  });

  it('should set backward-compatible junkScore to 1.0', () => {
    const s = classify(makeSession({ category: 'empty' }));
    assert.equal(s.junkScore, 1.0);
  });

  it('should set autoTier to original computed tier', () => {
    const s = classify(makeSession({ category: 'empty' }));
    assert.equal(s.autoTier, TIER_AUTO_DELETE);
  });
});

// ── Tier 4: KEEP ─────────────────────────────────────────────────────

describe('Tier 4 — KEEP', () => {
  it('should keep sessions with 4+ turns', () => {
    const s = classify(makeSession({ turnCount: 4 }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should keep sessions with 3+ tool calls', () => {
    const s = classify(makeSession({ totalToolCalls: 3 }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should keep sessions with 2+ thinking blocks', () => {
    const s = classify(makeSession({ thinkingBlocks: 2 }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should keep sessions touching 2+ unique files', () => {
    const s = classify(makeSession({ uniqueFilesCount: 2 }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should keep long-running sessions (5+ min)', () => {
    const s = classify(makeSession({ durationMs: 600_000 }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should keep sessions with 3+ user and 3+ assistant messages', () => {
    const s = classify(makeSession({
      userMessageCount: 3,
      assistantMessageCount: 3,
    }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should keep large sessions with 2+ user messages', () => {
    const s = classify(makeSession({
      fileSizeBytes: 60_000,
      userMessageCount: 2,
    }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should have junkScore 0.1 for keep tier', () => {
    const s = classify(makeSession({ turnCount: 10 }));
    assert.equal(s.junkScore, 0.1);
  });

  it('should have empty junkReasons', () => {
    const s = classify(makeSession({ turnCount: 10 }));
    assert.deepEqual(s.junkReasons, []);
  });
});

// ── Tier 2: SUGGESTED DELETE ─────────────────────────────────────────

describe('Tier 2 — SUGGESTED DELETE', () => {
  it('should flag single brief exchange under 1 min', () => {
    const s = classify(makeSession({
      userMessageCount: 1,
      assistantMessageCount: 1,
      durationMs: 30_000,
    }));
    assert.equal(s.tier, TIER_SUGGESTED);
    assert.ok(s.junkReasons.some(r => r.includes('single brief')));
  });

  it('should flag junk title patterns', () => {
    const s = classify(makeSession({
      title: 'init',
      userMessageCount: 1,
      assistantMessageCount: 2,
      durationMs: 200_000,
    }));
    assert.equal(s.tier, TIER_SUGGESTED);
    assert.ok(s.junkReasons.some(r => r.includes('junk pattern')));
  });

  it('should flag abandoned sessions (no assistant response)', () => {
    const s = classify(makeSession({
      userMessageCount: 1,
      assistantMessageCount: 0,
      durationMs: 200_000,
    }));
    assert.equal(s.tier, TIER_SUGGESTED);
    assert.ok(s.junkReasons.some(r => r.includes('abandoned')));
  });

  it('should flag short sessions with no tool usage', () => {
    const s = classify(makeSession({
      totalToolCalls: 0,
      userMessageCount: 2,
      assistantMessageCount: 2,
      durationMs: 90_000,
    }));
    assert.equal(s.tier, TIER_SUGGESTED);
    assert.ok(s.junkReasons.some(r => r.includes('no tool usage')));
  });

  it('should flag tiny sessions under 4KB with few messages', () => {
    const s = classify(makeSession({
      fileSizeBytes: 2000,
      userMessageCount: 1,
      assistantMessageCount: 1,
      durationMs: 200_000,
    }));
    assert.equal(s.tier, TIER_SUGGESTED);
    assert.ok(s.junkReasons.some(r => r.includes('tiny session')));
  });

  it('should have junkScore 0.7 for suggested tier', () => {
    const s = classify(makeSession({
      userMessageCount: 1,
      assistantMessageCount: 0,
      durationMs: 200_000,
    }));
    assert.equal(s.junkScore, 0.7);
  });
});

// ── Tier 3: REVIEW (fallback) ────────────────────────────────────────

describe('Tier 3 — REVIEW (fallback)', () => {
  it('should be the default when no other tier matches', () => {
    const s = classify(makeSession({
      userMessageCount: 2,
      assistantMessageCount: 2,
      durationMs: 150_000,
      totalToolCalls: 1,
      fileSizeBytes: 8000,
    }));
    assert.equal(s.tier, TIER_REVIEW);
    assert.equal(s.tierLabel, 'review');
  });

  it('should add "few user messages" reason', () => {
    const s = classify(makeSession({
      userMessageCount: 1,
      assistantMessageCount: 2,
      durationMs: 150_000,
      totalToolCalls: 1,
      fileSizeBytes: 8000,
    }));
    assert.equal(s.tier, TIER_REVIEW);
    assert.ok(s.junkReasons.some(r => r.includes('few user messages')));
  });

  it('should add "short duration" reason', () => {
    const s = classify(makeSession({
      userMessageCount: 2,
      assistantMessageCount: 2,
      durationMs: 90_000,
      totalToolCalls: 1,
      fileSizeBytes: 8000,
    }));
    assert.equal(s.tier, TIER_REVIEW);
    assert.ok(s.junkReasons.some(r => r.includes('short duration')));
  });

  it('should add "needs manual review" when no other reasons', () => {
    // Use 3+ user messages to avoid "few user messages", and duration > 120s
    // to avoid "short duration", but not enough for KEEP tier signals.
    const s = classify(makeSession({
      userMessageCount: 3,
      assistantMessageCount: 2,
      durationMs: 200_000,
      totalToolCalls: 1,
      fileSizeBytes: 8000,
    }));
    assert.equal(s.tier, TIER_REVIEW);
    assert.ok(s.junkReasons.some(r => r.includes('needs manual review')));
  });

  it('should have junkScore 0.4', () => {
    const s = classify(makeSession({
      userMessageCount: 2,
      assistantMessageCount: 2,
      durationMs: 150_000,
      totalToolCalls: 1,
      fileSizeBytes: 8000,
    }));
    assert.equal(s.junkScore, 0.4);
  });
});

// ── Tier override via metadata ───────────────────────────────────────

describe('Tier override', () => {
  it('should respect tierOverride to promote a session', () => {
    const s = classify(makeSession({
      category: 'empty',
      tierOverride: TIER_KEEP,
    }));
    assert.equal(s.tier, TIER_KEEP);
    assert.equal(s.autoTier, TIER_AUTO_DELETE);
  });

  it('should respect tierOverride to demote a session', () => {
    const s = classify(makeSession({
      turnCount: 10,
      tierOverride: TIER_SUGGESTED,
    }));
    assert.equal(s.tier, TIER_SUGGESTED);
    assert.equal(s.autoTier, TIER_KEEP);
  });
});

// ── classifyAll ──────────────────────────────────────────────────────

describe('classifyAll', () => {
  it('should classify every session in the array', () => {
    const sessions = [
      makeSession({ category: 'empty' }),
      makeSession({ turnCount: 10 }),
      makeSession({
        userMessageCount: 1,
        assistantMessageCount: 0,
        durationMs: 200_000,
      }),
    ];
    const result = classifyAll(sessions);
    assert.equal(result.length, 3);
    assert.equal(result[0].tier, TIER_AUTO_DELETE);
    assert.equal(result[1].tier, TIER_KEEP);
    assert.equal(result[2].tier, TIER_SUGGESTED);
  });

  it('should handle an empty array', () => {
    const result = classifyAll([]);
    assert.deepEqual(result, []);
  });
});

// ── tierLabel helper ─────────────────────────────────────────────────

describe('tierLabel()', () => {
  it('should return the label for known tiers', () => {
    assert.equal(tierLabel(1), 'auto-delete');
    assert.equal(tierLabel(2), 'suggested-delete');
    assert.equal(tierLabel(3), 'review');
    assert.equal(tierLabel(4), 'keep');
  });

  it('should return "unknown" for invalid tier', () => {
    assert.equal(tierLabel(99), 'unknown');
    assert.equal(tierLabel(0), 'unknown');
  });
});

// ── junkLabel helper (backward compat) ───────────────────────────────

describe('junkLabel()', () => {
  it('should return "junk" for score >= 0.6', () => {
    assert.equal(junkLabel(0.6), 'junk');
    assert.equal(junkLabel(1.0), 'junk');
    assert.equal(junkLabel(0.7), 'junk');
  });

  it('should return "maybe" for 0.3 <= score < 0.6', () => {
    assert.equal(junkLabel(0.3), 'maybe');
    assert.equal(junkLabel(0.5), 'maybe');
  });

  it('should return "real" for score < 0.3', () => {
    assert.equal(junkLabel(0.1), 'real');
    assert.equal(junkLabel(0.0), 'real');
    assert.equal(junkLabel(0.29), 'real');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('should handle session with all zero counts', () => {
    const s = classify(makeSession({
      userMessageCount: 0,
      assistantMessageCount: 0,
      fileSizeBytes: 500,
      durationMs: 0,
      totalToolCalls: 0,
      turnCount: 0,
    }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
  });

  it('should handle session with missing optional fields', () => {
    const s = classify({
      category: 'conversation',
      fileSizeBytes: 20_000,
      userMessageCount: 2,
      assistantMessageCount: 2,
      durationMs: 200_000,
    });
    // Missing turnCount, totalToolCalls, etc. should default to 0
    assert.ok([TIER_REVIEW, TIER_SUGGESTED, TIER_KEEP].includes(s.tier));
    assert.ok(s.tierLabel !== undefined);
  });

  it('should handle very large session data', () => {
    const s = classify(makeSession({
      fileSizeBytes: 500_000_000,
      userMessageCount: 10000,
      assistantMessageCount: 10000,
      turnCount: 5000,
      totalToolCalls: 20000,
      durationMs: 86_400_000,
    }));
    assert.equal(s.tier, TIER_KEEP);
  });

  it('should prioritize Tier 1 over Tier 4 signals', () => {
    // An empty session should be auto-delete even if it somehow has turnCount
    const s = classify(makeSession({
      category: 'empty',
      turnCount: 100,
    }));
    assert.equal(s.tier, TIER_AUTO_DELETE);
  });
});
