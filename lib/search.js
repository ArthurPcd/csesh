/**
 * Claude Sessions Organizer
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/claude-sessions-organizer
 */

import { junkLabel } from './classifier.js';

/**
 * Filter sessions by various criteria.
 */
export function filterSessions(sessions, {
  project = null,
  category = null,  // 'real', 'junk', 'maybe', or raw category
  tier = null,      // 1-4
  tag = null,       // filter by tag
  favorite = null,  // true to show only favorites
  from = null,
  to = null,
  query = null,
  sort = 'date',
  limit = 0,
  offset = 0,
} = {}) {
  let filtered = [...sessions];

  // Filter by project slug
  if (project) {
    filtered = filtered.filter(s =>
      s.slug === project ||
      s.shortProject.toLowerCase().includes(project.toLowerCase()) ||
      s.project.toLowerCase().includes(project.toLowerCase())
    );
  }

  // Filter by tier
  if (tier != null) {
    const tierNum = parseInt(tier);
    filtered = filtered.filter(s => s.tier === tierNum);
  }

  // Filter by category (junk label or raw category) — backward compat
  if (category === 'real') {
    filtered = filtered.filter(s => junkLabel(s.junkScore) === 'real');
  } else if (category === 'junk') {
    filtered = filtered.filter(s => junkLabel(s.junkScore) === 'junk');
  } else if (category === 'maybe') {
    filtered = filtered.filter(s => junkLabel(s.junkScore) === 'maybe');
  } else if (category === 'keep') {
    filtered = filtered.filter(s => s.tier === 4);
  } else if (category === 'review') {
    filtered = filtered.filter(s => s.tier === 3);
  } else if (category === 'suggested') {
    filtered = filtered.filter(s => s.tier === 2);
  } else if (category === 'auto-delete') {
    filtered = filtered.filter(s => s.tier === 1);
  } else if (category) {
    filtered = filtered.filter(s => s.category === category);
  }

  // Filter by tag
  if (tag) {
    const t = tag.toLowerCase();
    filtered = filtered.filter(s =>
      (s.tags && s.tags.includes(t)) ||
      (s.autoTags && s.autoTags.includes(t))
    );
  }

  // Filter by favorite
  if (favorite) {
    filtered = filtered.filter(s => s.favorite);
  }

  // Filter by date range
  if (from) {
    const fromDate = new Date(from);
    filtered = filtered.filter(s => s.firstTimestamp && new Date(s.firstTimestamp) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(s => s.firstTimestamp && new Date(s.firstTimestamp) <= toDate);
  }

  // Text search in title, project, cwd, gitBranch, tags, notes, autoTags
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(s =>
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.displayTitle && s.displayTitle.toLowerCase().includes(q)) ||
      (s.project && s.project.toLowerCase().includes(q)) ||
      (s.shortProject && s.shortProject.toLowerCase().includes(q)) ||
      (s.cwd && s.cwd.toLowerCase().includes(q)) ||
      (s.gitBranch && s.gitBranch.toLowerCase().includes(q)) ||
      (s.id && s.id.toLowerCase().includes(q)) ||
      (s.tags && s.tags.some(t => t.includes(q))) ||
      (s.autoTags && s.autoTags.some(t => t.includes(q))) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  // Sort
  switch (sort) {
    case 'size':
      filtered.sort((a, b) => b.fileSizeBytes - a.fileSizeBytes);
      break;
    case 'messages':
      filtered.sort((a, b) => (b.userMessageCount + b.assistantMessageCount) - (a.userMessageCount + a.assistantMessageCount));
      break;
    case 'junk':
    case 'tier':
      filtered.sort((a, b) => a.tier - b.tier || new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0));
      break;
    case 'project':
      filtered.sort((a, b) => (a.shortProject || '').localeCompare(b.shortProject || ''));
      break;
    case 'title':
      filtered.sort((a, b) => (a.displayTitle || a.title || '').localeCompare(b.displayTitle || b.title || ''));
      break;
    case 'date':
    default:
      filtered.sort((a, b) => {
        if (!a.lastTimestamp) return 1;
        if (!b.lastTimestamp) return -1;
        return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
      });
      break;
  }

  const total = filtered.length;
  if (offset > 0) filtered = filtered.slice(offset);
  if (limit > 0) filtered = filtered.slice(0, limit);

  return { total, offset, limit, sessions: filtered };
}
