/**
 * Tests for utility functions: formatting, cost estimation, junk detection, etc.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeProjectSlug,
  shortProjectName,
  truncate,
  extractTitle,
  formatBytes,
  formatDuration,
  formatDate,
  timeAgo,
  isJunkMessage,
  JUNK_PATTERNS,
  estimateCost,
  MODEL_PRICING,
} from '../lib/utils.js';

// ── decodeProjectSlug ────────────────────────────────────────────────

describe('decodeProjectSlug', () => {
  it('should decode a typical slug', () => {
    assert.equal(decodeProjectSlug('-Users-paco-dev-myproject'), '/Users/paco/dev/myproject');
  });

  it('should handle single-segment slug', () => {
    assert.equal(decodeProjectSlug('-root'), '/root');
  });

  it('should handle slug with no leading dash', () => {
    // Edge case: slug without leading -
    const result = decodeProjectSlug('nolead');
    assert.equal(result, 'nolead');
  });

  it('should handle empty string', () => {
    assert.equal(decodeProjectSlug(''), '');
  });
});

// ── shortProjectName ─────────────────────────────────────────────────

describe('shortProjectName', () => {
  it('should extract last segment of a path', () => {
    assert.equal(shortProjectName('/Users/paco/dev/myproject'), 'myproject');
  });

  it('should handle single segment', () => {
    assert.equal(shortProjectName('/root'), 'root');
  });

  it('should return input when no slashes', () => {
    assert.equal(shortProjectName('standalone'), 'standalone');
  });

  it('should handle trailing slash', () => {
    // filter(Boolean) removes trailing empty string
    assert.equal(shortProjectName('/Users/paco/project/'), 'project');
  });

  it('should handle empty string', () => {
    assert.equal(shortProjectName(''), '');
  });
});

// ── truncate ─────────────────────────────────────────────────────────

describe('truncate', () => {
  it('should not truncate short strings', () => {
    assert.equal(truncate('hello', 10), 'hello');
  });

  it('should truncate long strings with ellipsis', () => {
    const result = truncate('abcdefghij', 5);
    assert.equal(result.length, 5);
    assert.ok(result.endsWith('\u2026'));
  });

  it('should return exact length string unchanged', () => {
    assert.equal(truncate('abc', 3), 'abc');
  });

  it('should use default maxLen of 80', () => {
    const long = 'a'.repeat(100);
    const result = truncate(long);
    assert.equal(result.length, 80);
  });

  it('should return empty string for null/undefined', () => {
    assert.equal(truncate(null), '');
    assert.equal(truncate(undefined), '');
    assert.equal(truncate(''), '');
  });
});

// ── extractTitle ─────────────────────────────────────────────────────

describe('extractTitle', () => {
  it('should extract from plain string', () => {
    assert.equal(extractTitle('Fix the bug'), 'Fix the bug');
  });

  it('should take only first line', () => {
    assert.equal(extractTitle('Line 1\nLine 2\nLine 3'), 'Line 1');
  });

  it('should strip system-reminder tags', () => {
    const content = '<system-reminder>stuff</system-reminder>Real title';
    assert.equal(extractTitle(content), 'Real title');
  });

  it('should extract text from content blocks array', () => {
    const content = [
      { type: 'image', source: {} },
      { type: 'text', text: 'My title from block' },
    ];
    assert.equal(extractTitle(content), 'My title from block');
  });

  it('should return "(no title)" for null/empty', () => {
    assert.equal(extractTitle(null), '(no title)');
    assert.equal(extractTitle(''), '(no title)');
    assert.equal(extractTitle([]), '(no title)');
  });

  it('should return "(no title)" for whitespace-only after stripping', () => {
    assert.equal(extractTitle('   \n  '), '(no title)');
  });

  it('should truncate to 80 chars', () => {
    const long = 'A'.repeat(100);
    const result = extractTitle(long);
    assert.equal(result.length, 80);
  });
});

// ── formatBytes ──────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    assert.equal(formatBytes(0), '0 B');
  });

  it('should format bytes', () => {
    assert.equal(formatBytes(500), '500 B');
  });

  it('should format kilobytes', () => {
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(2048), '2.0 KB');
  });

  it('should format megabytes', () => {
    assert.equal(formatBytes(1_048_576), '1.0 MB');
  });

  it('should format gigabytes', () => {
    assert.equal(formatBytes(1_073_741_824), '1.0 GB');
  });

  it('should format fractional values', () => {
    assert.equal(formatBytes(1536), '1.5 KB');
  });
});

// ── formatDuration ───────────────────────────────────────────────────

describe('formatDuration', () => {
  it('should return "0s" for zero/null/negative', () => {
    assert.equal(formatDuration(0), '0s');
    assert.equal(formatDuration(null), '0s');
    assert.equal(formatDuration(-1000), '0s');
  });

  it('should format seconds', () => {
    assert.equal(formatDuration(30_000), '30s');
    assert.equal(formatDuration(59_999), '60s');
  });

  it('should format minutes', () => {
    assert.equal(formatDuration(60_000), '1m');
    assert.equal(formatDuration(300_000), '5m');
  });

  it('should format hours and minutes', () => {
    assert.equal(formatDuration(3_600_000), '1h');
    assert.equal(formatDuration(5_400_000), '1h 30m');
  });

  it('should round correctly', () => {
    assert.equal(formatDuration(90_000), '2m'); // 1.5 min rounds to 2
  });
});

// ── formatDate ───────────────────────────────────────────────────────

describe('formatDate', () => {
  it('should return "N/A" for null/undefined', () => {
    assert.equal(formatDate(null), 'N/A');
    assert.equal(formatDate(undefined), 'N/A');
  });

  it('should format a valid ISO timestamp', () => {
    const result = formatDate('2026-02-20T10:30:00Z');
    // Should contain date and time parts
    assert.ok(result.includes('2026'));
    assert.ok(result.length > 5);
  });
});

// ── timeAgo ──────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('should return empty for null', () => {
    assert.equal(timeAgo(null), '');
    assert.equal(timeAgo(undefined), '');
  });

  it('should return "just now" for very recent', () => {
    const result = timeAgo(new Date().toISOString());
    assert.equal(result, 'just now');
  });

  it('should return minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const result = timeAgo(fiveMinAgo);
    assert.ok(result.includes('m ago'));
  });

  it('should return hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const result = timeAgo(twoHoursAgo);
    assert.ok(result.includes('h ago'));
  });

  it('should return days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const result = timeAgo(threeDaysAgo);
    assert.ok(result.includes('d ago'));
  });

  it('should return months ago', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const result = timeAgo(ninetyDaysAgo);
    assert.ok(result.includes('mo ago'));
  });
});

// ── isJunkMessage ────────────────────────────────────────────────────

describe('isJunkMessage', () => {
  it('should detect "init"', () => {
    assert.ok(isJunkMessage('init'));
    assert.ok(isJunkMessage('/init'));
    assert.ok(isJunkMessage('INIT'));
  });

  it('should detect common junk patterns', () => {
    assert.ok(isJunkMessage('exit'));
    assert.ok(isJunkMessage('ls'));
    assert.ok(isJunkMessage('pwd'));
    assert.ok(isJunkMessage('q'));
    assert.ok(isJunkMessage('quit'));
    assert.ok(isJunkMessage('help'));
    assert.ok(isJunkMessage('/help'));
    assert.ok(isJunkMessage('h'));
    assert.ok(isJunkMessage('/h'));
    assert.ok(isJunkMessage('--continue'));
    assert.ok(isJunkMessage('--resume'));
    assert.ok(isJunkMessage('.'));
    assert.ok(isJunkMessage('test'));
    assert.ok(isJunkMessage('TEST'));
  });

  it('should detect whitespace-only messages', () => {
    assert.ok(isJunkMessage('   '));
    // Empty string returns false because of the !text guard
    assert.ok(!isJunkMessage(''));
  });

  it('should NOT flag real messages', () => {
    assert.ok(!isJunkMessage('Fix the authentication bug'));
    assert.ok(!isJunkMessage('Please refactor this function'));
    assert.ok(!isJunkMessage('What does this code do?'));
    assert.ok(!isJunkMessage('testing the new feature'));
  });

  it('should return false for null/undefined', () => {
    assert.ok(!isJunkMessage(null));
    assert.ok(!isJunkMessage(undefined));
  });

  it('should handle trimming', () => {
    assert.ok(isJunkMessage('  init  '));
    assert.ok(isJunkMessage('  exit  '));
  });
});

// ── JUNK_PATTERNS ────────────────────────────────────────────────────

describe('JUNK_PATTERNS', () => {
  it('should be an array of RegExp', () => {
    assert.ok(Array.isArray(JUNK_PATTERNS));
    assert.ok(JUNK_PATTERNS.every(p => p instanceof RegExp));
  });

  it('should have at least 10 patterns', () => {
    assert.ok(JUNK_PATTERNS.length >= 10);
  });
});

// ── estimateCost ─────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('should estimate cost for Sonnet input tokens', () => {
    const cost = estimateCost(
      { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      'claude-sonnet-4-6',
    );
    assert.equal(cost, 3.0);
  });

  it('should estimate cost for Sonnet output tokens', () => {
    const cost = estimateCost(
      { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      'claude-sonnet-4-6',
    );
    assert.equal(cost, 15.0);
  });

  it('should estimate cost for Opus', () => {
    const cost = estimateCost(
      { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      'claude-opus-4-6',
    );
    assert.equal(cost, 90.0); // 15 + 75
  });

  it('should include cache read/write costs', () => {
    const cost = estimateCost(
      { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 },
      'claude-sonnet-4-6',
    );
    // 0.30 + 3.75 = 4.05
    assert.ok(Math.abs(cost - 4.05) < 0.001);
  });

  it('should use default pricing for unknown models', () => {
    const cost = estimateCost(
      { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      'unknown-model-xyz',
    );
    assert.equal(cost, MODEL_PRICING.default.input); // 3.0
  });

  it('should handle zero tokens', () => {
    const cost = estimateCost(
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      'claude-sonnet-4-6',
    );
    assert.equal(cost, 0);
  });

  it('should handle missing token fields gracefully', () => {
    const cost = estimateCost({}, 'claude-sonnet-4-6');
    assert.equal(cost, 0);
  });

  it('should handle Haiku pricing', () => {
    const cost = estimateCost(
      { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      'claude-haiku-4-5-20251001',
    );
    assert.equal(cost, 4.8); // 0.80 + 4.0
  });
});

// ── MODEL_PRICING ────────────────────────────────────────────────────

describe('MODEL_PRICING', () => {
  it('should have a default entry', () => {
    assert.ok(MODEL_PRICING.default);
    assert.ok(MODEL_PRICING.default.input > 0);
    assert.ok(MODEL_PRICING.default.output > 0);
  });

  it('should have all required fields per model', () => {
    for (const [name, pricing] of Object.entries(MODEL_PRICING)) {
      assert.ok(typeof pricing.input === 'number', `${name} missing input`);
      assert.ok(typeof pricing.output === 'number', `${name} missing output`);
      assert.ok(typeof pricing.cacheRead === 'number', `${name} missing cacheRead`);
      assert.ok(typeof pricing.cacheWrite === 'number', `${name} missing cacheWrite`);
    }
  });

  it('should have Opus more expensive than Sonnet', () => {
    assert.ok(MODEL_PRICING['claude-opus-4-6'].input > MODEL_PRICING['claude-sonnet-4-6'].input);
    assert.ok(MODEL_PRICING['claude-opus-4-6'].output > MODEL_PRICING['claude-sonnet-4-6'].output);
  });
});
