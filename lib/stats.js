/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

import { junkLabel } from './classifier.js';
import { estimateCost, formatBytes } from './utils.js';

/**
 * Compute aggregated statistics from sessions.
 */
export function computeStats(sessions, projectFilter = null) {
  let filtered = sessions;
  if (projectFilter) {
    filtered = sessions.filter(s =>
      s.slug === projectFilter ||
      s.shortProject.toLowerCase().includes(projectFilter.toLowerCase())
    );
  }

  const totalSessions = filtered.length;
  const totalSize = filtered.reduce((sum, s) => sum + s.fileSizeBytes, 0);

  // Junk label counts (backward compat)
  const categories = { real: 0, maybe: 0, junk: 0 };
  for (const s of filtered) {
    categories[junkLabel(s.junkScore)]++;
  }

  // Tier distribution
  const tierDistribution = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of filtered) {
    if (s.tier >= 1 && s.tier <= 4) tierDistribution[s.tier]++;
  }

  // By raw category
  const rawCategories = {};
  for (const s of filtered) {
    rawCategories[s.category] = (rawCategories[s.category] || 0) + 1;
  }

  // Token totals
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const s of filtered) {
    tokens.input += s.tokenUsage.input;
    tokens.output += s.tokenUsage.output;
    tokens.cacheRead += s.tokenUsage.cacheRead;
    tokens.cacheWrite += s.tokenUsage.cacheWrite;
  }

  // Model distribution
  const modelCounts = {};
  for (const s of filtered) {
    for (const m of s.models) {
      modelCounts[m] = (modelCounts[m] || 0) + 1;
    }
  }

  // Estimated total cost
  let totalCost = 0;
  for (const s of filtered) {
    const model = s.models[0] || 'default';
    totalCost += estimateCost(s.tokenUsage, model);
  }

  // Messages totals
  const totalUserMessages = filtered.reduce((sum, s) => sum + s.userMessageCount, 0);
  const totalAssistantMessages = filtered.reduce((sum, s) => sum + s.assistantMessageCount, 0);

  // Activity by day
  const activityByDay = {};
  for (const s of filtered) {
    if (!s.firstTimestamp) continue;
    const day = s.firstTimestamp.slice(0, 10);
    if (!activityByDay[day]) activityByDay[day] = { sessions: 0, messages: 0 };
    activityByDay[day].sessions++;
    activityByDay[day].messages += s.userMessageCount + s.assistantMessageCount;
  }

  // Project distribution
  const projectCounts = {};
  const projectSizes = {};
  for (const s of filtered) {
    const p = s.shortProject;
    projectCounts[p] = (projectCounts[p] || 0) + 1;
    projectSizes[p] = (projectSizes[p] || 0) + s.fileSizeBytes;
  }

  const topProjects = Object.entries(projectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({
      name,
      sessions: count,
      size: projectSizes[name],
      sizeFormatted: formatBytes(projectSizes[name]),
    }));

  // Date range
  const dates = filtered.filter(s => s.firstTimestamp).map(s => s.firstTimestamp).sort();
  const firstDate = dates[0] || null;
  const lastDate = dates[dates.length - 1] || null;

  // Duration stats
  const durations = filtered.filter(s => s.durationMs > 0).map(s => s.durationMs);
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Potential cleanup savings (tier 1 + tier 2)
  const junkSize = filtered
    .filter(s => s.tier === 1 || s.tier === 2)
    .reduce((sum, s) => sum + s.fileSizeBytes, 0);

  // Tool usage aggregation (from deep analysis)
  const toolUsageTotal = {};
  for (const s of filtered) {
    if (s.toolUsage) {
      for (const [tool, count] of Object.entries(s.toolUsage)) {
        toolUsageTotal[tool] = (toolUsageTotal[tool] || 0) + count;
      }
    }
  }

  // Language distribution
  const languageDistribution = {};
  for (const s of filtered) {
    if (s.language) {
      languageDistribution[s.language] = (languageDistribution[s.language] || 0) + 1;
    }
  }

  // Tags (auto + user)
  const tagCounts = {};
  for (const s of filtered) {
    const allTags = [...(s.autoTags || []), ...(s.tags || [])];
    for (const t of allTags) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  // Favorites count
  const favoritesCount = filtered.filter(s => s.favorite).length;

  return {
    totalSessions,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    categories,
    tierDistribution,
    rawCategories,
    tokens,
    modelCounts,
    totalCost: Math.round(totalCost * 100) / 100,
    totalUserMessages,
    totalAssistantMessages,
    activityByDay,
    topProjects,
    firstDate,
    lastDate,
    avgDurationMs: Math.round(avgDuration),
    junkSize,
    junkSizeFormatted: formatBytes(junkSize),
    toolUsageTotal,
    languageDistribution,
    topTags,
    favoritesCount,
  };
}
