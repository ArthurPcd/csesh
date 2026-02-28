/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

import { homedir } from 'os';
import { join } from 'path';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
export const TOOL_DIR = join(CLAUDE_DIR, 'tools', 'csesh');
export const TRASH_DIR = join(TOOL_DIR, 'trash');
export const TRASH_MANIFEST = join(TOOL_DIR, 'trash-manifest.json');
export const CACHE_FILE = join(TOOL_DIR, 'cache.json');

/**
 * Decode a project directory name back to a readable path.
 * e.g. "-Users-paco-dev-myproject" → "/Users/paco/dev/myproject"
 */
export function decodeProjectSlug(slug) {
  return slug.replace(/^-/, '/').replace(/-/g, '/');
}

/**
 * Extract the short project name from a decoded path.
 * e.g. "/Users/paco/dev/myproject" → "myproject"
 */
export function shortProjectName(decodedPath) {
  const parts = decodedPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || decodedPath;
}

/**
 * Truncate a string to maxLen characters, appending "…" if truncated.
 */
export function truncate(str, maxLen = 80) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Extract a readable title from the first user message content.
 * Skips system-reminder blocks and hook outputs to find the core user intent.
 */
export function extractTitle(content) {
  if (!content) return '(no title)';
  let text = typeof content === 'string' ? content : '';
  if (Array.isArray(content)) {
    const textBlock = content.find(b => b.type === 'text');
    text = textBlock?.text || '';
  }
  // Strip system-reminder tags
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  // Strip hook output blocks (claude_background_info, fast_mode_info, env blocks, etc.)
  text = text.replace(/<claude_background_info>[\s\S]*?<\/claude_background_info>/g, '');
  text = text.replace(/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/g, '');
  text = text.replace(/<env>[\s\S]*?<\/env>/g, '');
  // Strip any remaining XML-style tags that wrap large blocks (multi-line)
  text = text.replace(/<[a-z_-]+>[\s\S]{200,}?<\/[a-z_-]+>/g, '');
  // Strip markdown metadata headers (lines starting with #)
  text = text.replace(/^#+\s.*$/gm, '');
  text = text.trim();
  // Take only the first non-empty line
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  text = lines[0] || '';
  if (!text) return '(no title)';
  // Collapse excess whitespace
  text = text.replace(/\s+/g, ' ');
  return truncate(text, 80);
}

/**
 * Build an intelligent session title from the first user message and tool usage.
 * Returns a descriptive title like: "Fix the login bug (Edit x8, Bash x3)"
 */
export function buildSessionTitle(firstUserContent, toolUsage) {
  const base = extractTitle(firstUserContent);
  if (base === '(no title)') return base;

  // Build tool usage suffix
  const suffix = buildToolSuffix(toolUsage);
  if (!suffix) return base;

  // Ensure total length fits — trim base if needed to make room for suffix
  const maxBaseLen = 80 - suffix.length - 1; // 1 for the space
  const trimmedBase = maxBaseLen > 20 ? truncate(base, maxBaseLen) : base;
  return `${trimmedBase} ${suffix}`;
}

/**
 * Build a compact tool usage summary string like "(Edit x8, Bash x3)".
 */
export function buildToolSuffix(toolUsage) {
  if (!toolUsage || typeof toolUsage !== 'object') return '';
  const entries = Object.entries(toolUsage)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '';
  // Show top 3 tools
  const top = entries.slice(0, 3).map(([name, count]) => `${name} x${count}`);
  return `(${top.join(', ')})`;
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format a date for display.
 */
export function formatDate(ts) {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a relative time (e.g. "2 hours ago").
 */
export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Known junk first-message patterns.
 */
export const JUNK_PATTERNS = [
  /^\/?init$/i,
  /^exit$/i,
  /^ls$/i,
  /^pwd$/i,
  /^q$/i,
  /^quit$/i,
  /^\/?(help|h)$/i,
  /^--continue$/i,
  /^--resume$/i,
  /^\s*$/,
  /^\.$/,
  /^test$/i,
];

/**
 * Check if a message text matches a known junk pattern.
 */
export function isJunkMessage(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return JUNK_PATTERNS.some(p => p.test(trimmed));
}

/**
 * Estimated cost per model per million tokens (rough 2025-2026 pricing).
 */
export const MODEL_PRICING = {
  'claude-sonnet-4-6':     { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-6':       { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  // Fallback for unknown models
  default:                 { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
};

/**
 * Estimate cost in USD from token counts and model.
 */
export function estimateCost(tokenUsage, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
  const perM = 1_000_000;
  const inputCost = ((tokenUsage.input || 0) / perM) * pricing.input;
  const outputCost = ((tokenUsage.output || 0) / perM) * pricing.output;
  const cacheReadCost = ((tokenUsage.cacheRead || 0) / perM) * pricing.cacheRead;
  const cacheWriteCost = ((tokenUsage.cacheWrite || 0) / perM) * pricing.cacheWrite;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
