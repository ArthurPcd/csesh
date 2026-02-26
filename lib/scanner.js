/**
 * Claude Sessions Organizer
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/claude-sessions-organizer
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { PROJECTS_DIR, decodeProjectSlug, extractTitle, shortProjectName } from './utils.js';
import { analyzeRecords } from './analyzer.js';

/**
 * List all project directories.
 */
export async function listProjects() {
  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => ({
      slug: e.name,
      path: decodeProjectSlug(e.name),
      shortName: shortProjectName(decodeProjectSlug(e.name)),
      dir: join(PROJECTS_DIR, e.name),
    }));
}

/**
 * Find all .jsonl session files across all projects (or a specific one).
 */
export async function findSessionFiles(projectSlug = null) {
  const projects = projectSlug
    ? [{ slug: projectSlug, dir: join(PROJECTS_DIR, projectSlug) }]
    : await listProjects();

  const files = [];
  for (const project of projects) {
    let entries;
    try {
      entries = await readdir(project.dir);
    } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const filePath = join(project.dir, name);
      const id = name.replace('.jsonl', '');
      files.push({ id, filePath, projectSlug: project.slug });
    }
  }
  return files;
}

/**
 * Read the first N and last M lines of a file efficiently.
 */
async function readHeadTail(filePath, headCount = 30, tailCount = 10) {
  const lines = [];
  const tailBuffer = [];

  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum <= headCount) {
      lines.push(line);
    } else {
      tailBuffer.push(line);
      if (tailBuffer.length > tailCount) tailBuffer.shift();
    }
  }

  const headSet = new Set(lines);
  for (const tl of tailBuffer) {
    if (!headSet.has(tl)) lines.push(tl);
  }

  return lines;
}

/**
 * Read all lines of a file.
 */
async function readAllLines(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return content.split('\n').filter(l => l.trim());
}

/**
 * Parse JSONL records into a session summary.
 * When analyze=true, also runs deep analysis via analyzer.js.
 */
function parseRecords(records, id, filePath, projectSlug, fileSize, { analyze = false } = {}) {
  const summary = {
    id,
    slug: projectSlug,
    sessionSlug: null,
    project: decodeProjectSlug(projectSlug),
    shortProject: shortProjectName(decodeProjectSlug(projectSlug)),
    filePath,
    fileSizeBytes: fileSize,
    firstTimestamp: null,
    lastTimestamp: null,
    durationMs: 0,
    title: '(no title)',
    userMessageCount: 0,
    assistantMessageCount: 0,
    totalRecordCount: records.length,
    gitBranch: null,
    cwd: null,
    version: null,
    tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    models: new Set(),
    category: 'empty',
    // Tier fields (set by classifier)
    tier: 0,
    tierLabel: '',
    autoTier: 0,
    junkScore: 0,
    junkReasons: [],
    // Deep analysis fields (populated when analyze=true)
    toolUsage: null,
    totalToolCalls: 0,
    failedToolCalls: 0,
    thinkingBlocks: 0,
    thinkingCharacters: 0,
    turnCount: 0,
    avgResponseLength: 0,
    hasSubAgents: false,
    filesTouched: [],
    uniqueFilesCount: 0,
    firstUserMessage: '',
    lastUserMessage: '',
    autoTags: [],
    language: null,
    analyzed: false,
  };

  let firstUserMessage = null;
  let hasUserMessage = false;
  let hasAssistantMessage = false;
  let hasProgress = false;
  let hasHookProgress = false;
  const timestamps = [];

  for (const rec of records) {
    if (rec.timestamp) timestamps.push(rec.timestamp);

    // Extract session slug from records
    if (rec.slug && !summary.sessionSlug) summary.sessionSlug = rec.slug;

    if (rec.gitBranch && !summary.gitBranch) summary.gitBranch = rec.gitBranch;
    if (rec.cwd && !summary.cwd) summary.cwd = rec.cwd;
    if (rec.version && !summary.version) summary.version = rec.version;

    if (rec.type === 'user') {
      summary.userMessageCount++;
      hasUserMessage = true;
      if (!firstUserMessage && rec.message?.content) {
        firstUserMessage = rec.message.content;
      }
    } else if (rec.type === 'assistant') {
      summary.assistantMessageCount++;
      hasAssistantMessage = true;

      const usage = rec.message?.usage;
      if (usage) {
        summary.tokenUsage.input += usage.input_tokens || 0;
        summary.tokenUsage.output += usage.output_tokens || 0;
        summary.tokenUsage.cacheRead += usage.cache_read_input_tokens || 0;
        summary.tokenUsage.cacheWrite += usage.cache_creation_input_tokens || 0;
      }

      if (rec.message?.model) summary.models.add(rec.message.model);
    } else if (rec.type === 'progress') {
      hasProgress = true;
      if (rec.data?.type === 'hook_progress') hasHookProgress = true;
    }
  }

  if (firstUserMessage) {
    summary.title = extractTitle(firstUserMessage);
  }

  if (timestamps.length > 0) {
    timestamps.sort();
    summary.firstTimestamp = timestamps[0];
    summary.lastTimestamp = timestamps[timestamps.length - 1];
    summary.durationMs = new Date(summary.lastTimestamp) - new Date(summary.firstTimestamp);
  }

  if (!hasUserMessage && !hasAssistantMessage && !hasProgress) {
    summary.category = 'empty';
  } else if (hasUserMessage || hasAssistantMessage) {
    summary.category = 'conversation';
  } else if (hasHookProgress && !hasUserMessage) {
    summary.category = 'hook-only';
  } else {
    summary.category = 'snapshot-only';
  }

  summary.models = [...summary.models];

  // Deep analysis
  if (analyze) {
    const analysis = analyzeRecords(records);
    Object.assign(summary, analysis);
    summary.analyzed = true;
  }

  return summary;
}

/**
 * Fast scan: read head+tail for quick metadata extraction.
 */
export async function fastScan(sessionFile) {
  const { id, filePath, projectSlug } = sessionFile;
  const fileInfo = await stat(filePath);
  const lines = await readHeadTail(filePath, 30, 10);
  const records = [];
  for (const line of lines) {
    try { records.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return parseRecords(records, id, filePath, projectSlug, fileInfo.size);
}

/**
 * Full scan: read entire file for complete data.
 * With analyze=true, also runs deep analysis.
 */
export async function fullScan(sessionFile, { analyze = false } = {}) {
  const { id, filePath, projectSlug } = sessionFile;
  const fileInfo = await stat(filePath);
  const lines = await readAllLines(filePath);
  const records = [];
  for (const line of lines) {
    try { records.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return parseRecords(records, id, filePath, projectSlug, fileInfo.size, { analyze });
}

/**
 * Scan all sessions (fast or full).
 */
export async function scanAll({ projectSlug = null, mode = 'fast', analyze = false } = {}) {
  const files = await findSessionFiles(projectSlug);
  const scanFn = mode === 'full'
    ? (f) => fullScan(f, { analyze })
    : fastScan;

  const batchSize = 50;
  const results = [];
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(f => scanFn(f).catch(() => null)));
    results.push(...batchResults.filter(Boolean));
  }

  results.sort((a, b) => {
    if (!a.lastTimestamp) return 1;
    if (!b.lastTimestamp) return -1;
    return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
  });

  return results;
}

/**
 * Read all messages from a session for conversation viewing.
 * Returns rich content blocks (text, thinking, tool_use, tool_result).
 */
export async function readMessages(filePath, { offset = 0, limit = 100 } = {}) {
  const lines = await readAllLines(filePath);
  const messages = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (rec.type === 'user' || rec.type === 'assistant') {
        messages.push({
          type: rec.type,
          timestamp: rec.timestamp,
          role: rec.message?.role,
          model: rec.message?.model,
          blocks: extractContentBlocks(rec.message?.content),
          content: extractMessageContent(rec.message?.content),
          usage: rec.message?.usage ? {
            input: rec.message.usage.input_tokens || 0,
            output: rec.message.usage.output_tokens || 0,
            cacheRead: rec.message.usage.cache_read_input_tokens || 0,
          } : null,
        });
      }
    } catch { /* skip */ }
  }
  return {
    total: messages.length,
    offset,
    limit,
    messages: messages.slice(offset, offset + limit),
  };
}

/**
 * Extract rich content blocks for the conversation viewer.
 */
function extractContentBlocks(content) {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) {
    return content.map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text || '' };
      }
      if (block.type === 'thinking') {
        return { type: 'thinking', text: block.thinking || '', chars: (block.thinking || '').length };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          name: block.name,
          toolId: block.id,
          input: summarizeToolInput(block.name, block.input),
        };
      }
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result',
          toolId: block.tool_use_id,
          isError: block.is_error || false,
          content: typeof block.content === 'string'
            ? block.content.slice(0, 2000)
            : '',
        };
      }
      return { type: block.type || 'unknown' };
    });
  }
  return [];
}

/**
 * Summarize tool input for compact display.
 */
function summarizeToolInput(toolName, input) {
  if (!input) return '';
  switch (toolName) {
    case 'Read': return input.file_path || '';
    case 'Write': return input.file_path || '';
    case 'Edit': return input.file_path || '';
    case 'Bash': return (input.command || '').slice(0, 200);
    case 'Glob': return input.pattern || '';
    case 'Grep': return `${input.pattern || ''} ${input.path || ''}`.trim();
    case 'WebFetch': return input.url || '';
    case 'WebSearch': return input.query || '';
    case 'Task': return (input.description || input.prompt || '').slice(0, 100);
    default: return JSON.stringify(input).slice(0, 200);
  }
}

/**
 * Extract plain text content from a message.
 */
function extractMessageContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return '';
}
