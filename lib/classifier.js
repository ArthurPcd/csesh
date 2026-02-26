/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

/**
 * 4-tier session classification system.
 *
 * Tier 1 — AUTO-DELETE:    100% safe to remove (empty, hook-only, snapshot-only)
 * Tier 2 — SUGGESTED:      High confidence junk, quick human glance recommended
 * Tier 3 — REVIEW:         Could go either way, needs review
 * Tier 4 — KEEP:           Real conversations with substance
 */

import { isJunkMessage } from './utils.js';

export const TIER_AUTO_DELETE = 1;
export const TIER_SUGGESTED = 2;
export const TIER_REVIEW = 3;
export const TIER_KEEP = 4;

export const TIER_LABELS = {
  [TIER_AUTO_DELETE]: 'auto-delete',
  [TIER_SUGGESTED]: 'suggested-delete',
  [TIER_REVIEW]: 'review',
  [TIER_KEEP]: 'keep',
};

export const TIER_COLORS = {
  [TIER_AUTO_DELETE]: 'red',
  [TIER_SUGGESTED]: 'yellow',
  [TIER_REVIEW]: 'blue',
  [TIER_KEEP]: 'green',
};

// Score mapping for backward compatibility
const TIER_SCORES = {
  [TIER_AUTO_DELETE]: 1.0,
  [TIER_SUGGESTED]: 0.7,
  [TIER_REVIEW]: 0.4,
  [TIER_KEEP]: 0.1,
};

/**
 * Classify a session into one of 4 tiers.
 * Mutates session in-place. Returns the session.
 */
export function classify(session) {
  const reasons = [];

  // ── Tier 1: AUTO-DELETE (100% safe) ───────────────────────────
  if (isTier1(session, reasons)) {
    return applyTier(session, TIER_AUTO_DELETE, reasons);
  }

  // ── Tier 4: KEEP (check before 2/3 — be conservative) ────────
  if (isTier4(session)) {
    return applyTier(session, TIER_KEEP, []);
  }

  // ── Tier 2: SUGGESTED DELETE ──────────────────────────────────
  if (isTier2(session, reasons)) {
    return applyTier(session, TIER_SUGGESTED, reasons);
  }

  // ── Tier 3: REVIEW (default fallback) ─────────────────────────
  computeReviewReasons(session, reasons);
  return applyTier(session, TIER_REVIEW, reasons);
}

function isTier1(session, reasons) {
  if (session.category === 'empty') {
    reasons.push('empty session (no records)');
    return true;
  }
  if (session.category === 'hook-only') {
    reasons.push('hook-only (system events, no conversation)');
    return true;
  }
  if (session.category === 'snapshot-only') {
    reasons.push('snapshot-only (file history, no conversation)');
    return true;
  }
  if (session.fileSizeBytes < 1024 && session.userMessageCount === 0) {
    reasons.push('tiny file with no user messages');
    return true;
  }
  if (session.totalRecordCount <= 2 && session.userMessageCount === 0) {
    reasons.push('minimal records, no user messages');
    return true;
  }
  return false;
}

function isTier4(session) {
  // Deep analysis fields (present after full scan with analyzer)
  const turnCount = session.turnCount || 0;
  const toolCalls = session.totalToolCalls || 0;
  const thinkingBlocks = session.thinkingBlocks || 0;
  const filesCount = session.uniqueFilesCount || 0;

  // If deep analysis data is available, use it
  if (turnCount >= 4) return true;
  if (toolCalls >= 3) return true;
  if (thinkingBlocks >= 2) return true;
  if (filesCount >= 2) return true;

  // Fallback for sessions without deep analysis
  if (session.durationMs > 300_000) return true; // 5+ minutes
  if (session.userMessageCount >= 3 && session.assistantMessageCount >= 3) return true;
  if (session.fileSizeBytes > 50_000 && session.userMessageCount >= 2) return true;

  return false;
}

function isTier2(session, reasons) {
  // Single short interaction
  if (session.userMessageCount === 1 && session.assistantMessageCount <= 1 && session.durationMs < 60_000) {
    reasons.push('single brief exchange (< 1 min)');
    return true;
  }

  // Junk pattern in title
  if (session.title && isJunkMessage(session.title)) {
    reasons.push(`junk pattern: "${session.title}"`);
    return true;
  }

  // User messages but no assistant response (abandoned)
  if (session.userMessageCount > 0 && session.assistantMessageCount === 0) {
    reasons.push('no assistant response (abandoned)');
    return true;
  }

  // Very short with no tool usage
  const toolCalls = session.totalToolCalls || 0;
  if (toolCalls === 0 && session.userMessageCount <= 2 && session.durationMs < 120_000) {
    reasons.push('short session with no tool usage');
    return true;
  }

  // Small file with very few messages
  if (session.fileSizeBytes < 4096 && (session.userMessageCount + session.assistantMessageCount) <= 2) {
    reasons.push('tiny session (< 4KB, ≤ 2 messages)');
    return true;
  }

  return false;
}

function computeReviewReasons(session, reasons) {
  if (session.userMessageCount <= 2) reasons.push('few user messages');
  if (session.durationMs < 120_000 && session.durationMs > 0) reasons.push('short duration');
  if (session.assistantMessageCount === 0) reasons.push('no assistant response');
  if (reasons.length === 0) reasons.push('needs manual review');
}

function applyTier(session, tier, reasons) {
  // Allow user override via metadata
  const effectiveTier = session.tierOverride != null ? session.tierOverride : tier;

  session.tier = effectiveTier;
  session.tierLabel = TIER_LABELS[effectiveTier];
  session.autoTier = tier; // original computed tier (before override)
  session.junkScore = TIER_SCORES[effectiveTier]; // backward compat
  session.junkReasons = reasons;
  return session;
}

/**
 * Classify all sessions in an array.
 */
export function classifyAll(sessions) {
  return sessions.map(classify);
}

/**
 * Get the tier label for display.
 */
export function tierLabel(tier) {
  return TIER_LABELS[tier] || 'unknown';
}

/**
 * Backward-compatible junk label from score.
 */
export function junkLabel(score) {
  if (score >= 0.6) return 'junk';
  if (score >= 0.3) return 'maybe';
  return 'real';
}
