#!/usr/bin/env node

/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { findSessionFiles, fullScan, fastScan, readMessages } from '../lib/scanner.js';
import { getCached, setCached, flushCache, clearCache, cacheStats } from '../lib/cache.js';
import { classifyAll, junkLabel, tierLabel, TIER_LABELS } from '../lib/classifier.js';
import { filterSessions } from '../lib/search.js';
import { computeStats } from '../lib/stats.js';
import { trashSession, restoreSession, listTrash, emptyTrash, deleteFromTrash } from '../lib/cleanup.js';
import { mergeMetadata, loadMetadata, setTitle as metaSetTitle, addTag as metaAddTag, removeTag as metaRemoveTag, toggleFavorite, setNote, getAllTags } from '../lib/metadata.js';
import { formatBytes, formatDuration, formatDate, timeAgo, estimateCost, CLAUDE_DIR, PROJECTS_DIR, TOOL_DIR, CACHE_FILE } from '../lib/utils.js';
import { getConfig } from '../lib/config.js';
import { stat as fsStat, access, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';

const VERSION = createRequire(import.meta.url)('../package.json').version;
const BRAND = '\u2B21'; // ⬡
const INIT_MARKER = join(TOOL_DIR, '.csesh-init');

const program = new Command();
program
  .name('csesh')
  .description('Claude Code session manager')
  .version(VERSION, '-v, --version');

// ── First-run experience ────────────────────────────────────────────────────

async function checkFirstRun() {
  try {
    await access(INIT_MARKER);
    return; // marker exists, not first run
  } catch {
    // First run — show welcome
  }

  const { mkdir, writeFile } = await import('fs/promises');

  console.log();
  console.log(chalk.bold(`  ${BRAND} Welcome to csesh v${VERSION}`));
  console.log(chalk.dim('  Claude Code session manager'));
  console.log();
  console.log('  Get started with these commands:');
  console.log();
  console.log(`    ${chalk.cyan('csesh web')}     ${chalk.dim('Launch the web dashboard')}`);
  console.log(`    ${chalk.cyan('csesh stats')}   ${chalk.dim('See aggregated statistics')}`);
  console.log(`    ${chalk.cyan('csesh list')}    ${chalk.dim('Browse all sessions')}`);
  console.log();
  console.log(chalk.dim('  Run csesh --help for all commands.'));
  console.log();

  try {
    await mkdir(TOOL_DIR, { recursive: true });
    await writeFile(INIT_MARKER, new Date().toISOString(), 'utf-8');
  } catch { /* best effort */ }
}

// ── Custom help formatter ────────────────────────────────────────────────────

program.configureHelp({
  formatHelp(cmd, helper) {
    const name = cmd.name();
    const desc = cmd.description();
    const cmds = cmd.commands;
    const opts = cmd.options;

    let out = '';
    out += `\n  ${chalk.bold(`${BRAND} csesh`)} ${chalk.dim(`v${VERSION}`)}\n`;
    out += `  ${desc}\n\n`;

    if (cmds.length > 0) {
      out += `  ${chalk.bold('Commands:')}\n`;
      const maxLen = Math.max(...cmds.map(c => c.name().length));
      for (const c of cmds) {
        out += `    ${chalk.cyan(c.name().padEnd(maxLen + 2))} ${c.description()}\n`;
      }
      out += '\n';
    }

    if (opts.length > 0) {
      out += `  ${chalk.bold('Options:')}\n`;
      for (const o of opts) {
        const flags = o.flags;
        out += `    ${chalk.cyan(flags.padEnd(24))} ${o.description}\n`;
      }
      out += '\n';
    }

    return out;
  }
});

// ── Session loading ──────────────────────────────────────────────────────────

async function loadSessions({ project = null, mode = 'fast', showProgress = true, analyze = false } = {}) {
  const files = await findSessionFiles(project);
  const results = [];
  let cached = 0;
  let scanned = 0;

  if (showProgress && files.length > 0) {
    process.stderr.write(`  ${BRAND} csesh ${chalk.dim(`\u2014 scanning ${files.length} sessions...`)}\n`);
  }

  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const batchResults = await Promise.all(batch.map(async f => {
      const cachedData = await getCached(f.filePath, { requireAnalyzed: analyze });
      if (cachedData) { cached++; return cachedData; }
      try {
        const summary = analyze
          ? await fullScan(f, { analyze: true })
          : await fastScan(f);
        await setCached(f.filePath, summary);
        scanned++;
        return summary;
      } catch (err) {
        console.error(`csesh: scan error: ${err.message}`);
        return null;
      }
    }));
    results.push(...batchResults.filter(Boolean));
    if (showProgress && i + 50 < files.length) {
      process.stderr.write(`\r  Scanning... ${Math.min(i + 50, files.length)}/${files.length}`);
    }
  }

  if (showProgress && files.length > 50) {
    process.stderr.write(`\r  Scanned ${scanned}, cached ${cached}, total ${results.length}\n`);
  }

  await flushCache();
  classifyAll(results);
  await mergeMetadata(results);

  results.sort((a, b) => {
    if (!a.lastTimestamp) return 1;
    if (!b.lastTimestamp) return -1;
    return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
  });

  return results;
}

function tierColor(tier) {
  switch (tier) {
    case 1: return chalk.red;
    case 2: return chalk.yellow;
    case 3: return chalk.blue;
    case 4: return chalk.green;
    default: return chalk.white;
  }
}

function tierBadge(tier) {
  const color = tierColor(tier);
  const label = TIER_LABELS[tier] || '?';
  return color(`[${label}]`);
}

// ── LIST ─────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List sessions')
  .option('-p, --project <name>', 'Filter by project')
  .option('-s, --sort <field>', 'Sort by: date, size, messages, tier', 'date')
  .option('--junk', 'Show only junk sessions (tier 1+2)')
  .option('--real', 'Show only real sessions (tier 4)')
  .option('--tier <n>', 'Filter by tier (1-4)')
  .option('--tag <tag>', 'Filter by tag')
  .option('--favorites', 'Show only favorites')
  .option('-n, --limit <n>', 'Limit results', parseInt)
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const sessions = await loadSessions({ project: opts.project });
    let category = null;
    if (opts.junk) category = 'junk';
    else if (opts.real) category = 'keep';

    const { sessions: filtered, total } = filterSessions(sessions, {
      project: opts.project,
      category,
      tier: opts.tier ? parseInt(opts.tier) : null,
      tag: opts.tag,
      favorite: opts.favorites || null,
      sort: opts.sort,
      limit: opts.limit || 50,
    });

    if (opts.json) {
      const data = filtered.map(s => ({
        id: s.id,
        date: s.lastTimestamp,
        project: s.shortProject,
        title: s.displayTitle || s.title,
        messages: s.userMessageCount + s.assistantMessageCount,
        size: s.fileSizeBytes,
        tier: s.tier,
        tierLabel: s.tierLabel,
        favorite: s.favorite || false,
        tags: s.tags || [],
      }));
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }

    const table = new Table({
      head: ['DATE', 'PROJECT', 'TITLE', 'MSGS', 'SIZE', 'TIER', 'ID'].map(h => chalk.cyan(h)),
      colWidths: [18, 16, 38, 6, 8, 18, 10],
      wordWrap: true,
    });

    for (const s of filtered) {
      const fav = s.favorite ? chalk.yellow('\u2605 ') : '';
      const title = fav + (s.displayTitle || s.title).slice(0, 34);
      table.push([
        formatDate(s.lastTimestamp),
        s.shortProject.slice(0, 14),
        title,
        s.userMessageCount + s.assistantMessageCount,
        formatBytes(s.fileSizeBytes),
        tierBadge(s.tier),
        s.id.slice(0, 8),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim(`  Showing ${filtered.length} of ${total} sessions`));
  });

// ── SHOW ─────────────────────────────────────────────────────────────────────

program
  .command('show <id>')
  .description('Show session details')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    const sessions = await loadSessions({ showProgress: false });
    const session = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!session) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({ error: `Session not found: ${id}` }) + '\n');
      } else {
        console.log(chalk.red(`  \u2717 Session not found: ${id}`));
      }
      process.exit(1);
    }

    const model = session.models[0] || 'default';
    const cost = estimateCost(session.tokenUsage, model);

    if (opts.json) {
      const data = {
        id: session.id,
        title: session.displayTitle || session.title,
        originalTitle: session.customTitle ? session.title : null,
        project: session.project,
        shortProject: session.shortProject,
        firstTimestamp: session.firstTimestamp,
        lastTimestamp: session.lastTimestamp,
        durationMs: session.durationMs,
        userMessageCount: session.userMessageCount,
        assistantMessageCount: session.assistantMessageCount,
        fileSizeBytes: session.fileSizeBytes,
        category: session.category,
        tier: session.tier,
        tierLabel: session.tierLabel,
        junkReasons: session.junkReasons,
        tags: session.tags || [],
        favorite: session.favorite || false,
        notes: session.notes || '',
        gitBranch: session.gitBranch,
        cwd: session.cwd,
        version: session.version,
        models: session.models,
        tokenUsage: session.tokenUsage,
        estimatedCost: cost,
        filePath: session.filePath,
      };
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }

    console.log(chalk.bold('\n  Session Details\n'));
    console.log(`  ${chalk.cyan('ID:')}        ${session.id}`);
    console.log(`  ${chalk.cyan('Title:')}     ${session.displayTitle || session.title}`);
    if (session.customTitle) console.log(`  ${chalk.cyan('Original:')}  ${session.title}`);
    console.log(`  ${chalk.cyan('Project:')}   ${session.project}`);
    console.log(`  ${chalk.cyan('Date:')}      ${formatDate(session.firstTimestamp)} \u2192 ${formatDate(session.lastTimestamp)}`);
    console.log(`  ${chalk.cyan('Duration:')}  ${formatDuration(session.durationMs)}`);
    console.log(`  ${chalk.cyan('Messages:')}  ${session.userMessageCount} user, ${session.assistantMessageCount} assistant`);
    console.log(`  ${chalk.cyan('Size:')}      ${formatBytes(session.fileSizeBytes)}`);
    console.log(`  ${chalk.cyan('Category:')} ${session.category}`);
    console.log(`  ${chalk.cyan('Tier:')}      ${tierBadge(session.tier)}`);
    if (session.junkReasons.length > 0) {
      console.log(`  ${chalk.cyan('Reasons:')}   ${session.junkReasons.join(', ')}`);
    }
    if (session.tags?.length > 0) {
      console.log(`  ${chalk.cyan('Tags:')}      ${session.tags.map(t => chalk.magenta(`#${t}`)).join(' ')}`);
    }
    if (session.favorite) console.log(`  ${chalk.cyan('Favorite:')}  ${chalk.yellow('\u2605 Yes')}`);
    if (session.notes) console.log(`  ${chalk.cyan('Notes:')}     ${session.notes}`);
    console.log(`  ${chalk.cyan('Branch:')}    ${session.gitBranch || 'N/A'}`);
    console.log(`  ${chalk.cyan('CWD:')}       ${session.cwd || 'N/A'}`);
    console.log(`  ${chalk.cyan('Version:')}   ${session.version || 'N/A'}`);
    console.log(`  ${chalk.cyan('Models:')}    ${session.models.join(', ') || 'N/A'}`);
    console.log(`  ${chalk.cyan('Tokens:')}    ${session.tokenUsage.input.toLocaleString()} in, ${session.tokenUsage.output.toLocaleString()} out, ${session.tokenUsage.cacheRead.toLocaleString()} cached`);
    console.log(`  ${chalk.cyan('Est. Cost:')} $${cost.toFixed(4)}`);
    console.log(`  ${chalk.cyan('File:')}      ${session.filePath}`);
    console.log();
  });

// ── ANALYZE ──────────────────────────────────────────────────────────────────

program
  .command('analyze [id]')
  .description('Deep analysis of a session (tool usage, thinking, files)')
  .action(async (id) => {
    if (id) {
      // Analyze single session
      const files = await findSessionFiles();
      const file = files.find(f => f.id === id || f.id.startsWith(id));
      if (!file) {
        console.log(chalk.red(`  \u2717 Session not found: ${id}`));
        process.exit(1);
      }
      process.stderr.write('  Analyzing...\n');
      const session = await fullScan(file, { analyze: true });
      classifyAll([session]);
      await mergeMetadata([session]);
      await setCached(file.filePath, session);
      await flushCache();

      console.log(chalk.bold(`\n  Deep Analysis: ${session.displayTitle || session.title}\n`));
      console.log(`  ${chalk.cyan('Tier:')}           ${tierBadge(session.tier)}`);
      console.log(`  ${chalk.cyan('Turn count:')}     ${session.turnCount}`);
      console.log(`  ${chalk.cyan('Tool calls:')}     ${session.totalToolCalls} (${session.failedToolCalls} failed)`);
      console.log(`  ${chalk.cyan('Thinking:')}       ${session.thinkingBlocks} blocks, ${session.thinkingCharacters.toLocaleString()} chars`);
      console.log(`  ${chalk.cyan('Avg response:')}   ${session.avgResponseLength.toLocaleString()} chars`);
      console.log(`  ${chalk.cyan('Files touched:')}  ${session.uniqueFilesCount}`);
      console.log(`  ${chalk.cyan('Sub-agents:')}     ${session.hasSubAgents ? 'Yes' : 'No'}`);
      console.log(`  ${chalk.cyan('Language:')}       ${session.language || 'unknown'}`);
      console.log(`  ${chalk.cyan('Auto-tags:')}      ${(session.autoTags || []).map(t => chalk.magenta(`#${t}`)).join(' ') || 'none'}`);

      if (session.toolUsage && Object.keys(session.toolUsage).length > 0) {
        console.log(chalk.bold('\n  Tool Breakdown:'));
        const maxCount = Math.max(...Object.values(session.toolUsage));
        const sorted = Object.entries(session.toolUsage).sort((a, b) => b[1] - a[1]);
        for (const [tool, count] of sorted) {
          const barLen = Math.round((count / maxCount) * 20);
          const bar = chalk.cyan('\u2588'.repeat(barLen));
          console.log(`    ${tool.padEnd(15)} ${String(count).padStart(4)}  ${bar}`);
        }
      }

      if (session.filesTouched?.length > 0) {
        console.log(chalk.bold('\n  Files Touched:'));
        for (const f of session.filesTouched.slice(0, 15)) {
          console.log(`    ${chalk.dim(f)}`);
        }
        if (session.filesTouched.length > 15) {
          console.log(chalk.dim(`    ... and ${session.filesTouched.length - 15} more`));
        }
      }
      console.log();
    } else {
      // Analyze all
      console.log('  Running deep analysis on all sessions...');
      const sessions = await loadSessions({ analyze: true });
      const stats = computeStats(sessions);
      console.log(chalk.bold(`\n  Deep Analysis Summary (${sessions.length} sessions)\n`));
      console.log(`  ${chalk.green('Keep:')} ${stats.tierDistribution[4]}  ${chalk.blue('Review:')} ${stats.tierDistribution[3]}  ${chalk.yellow('Suggested:')} ${stats.tierDistribution[2]}  ${chalk.red('Auto-delete:')} ${stats.tierDistribution[1]}`);

      if (Object.keys(stats.toolUsageTotal).length > 0) {
        console.log(chalk.bold('\n  Top Tools (across all sessions):'));
        const sorted = Object.entries(stats.toolUsageTotal).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const maxCount = sorted[0]?.[1] || 1;
        for (const [tool, count] of sorted) {
          const barLen = Math.round((count / maxCount) * 25);
          console.log(`    ${tool.padEnd(15)} ${String(count).padStart(5)}  ${chalk.cyan('\u2588'.repeat(barLen))}`);
        }
      }

      if (stats.topTags.length > 0) {
        console.log(chalk.bold('\n  Top Tags:'));
        console.log(`    ${stats.topTags.slice(0, 10).map(t => chalk.magenta(`#${t.tag}(${t.count})`)).join('  ')}`);
      }
      console.log();
    }
  });

// ── SEARCH ───────────────────────────────────────────────────────────────────

program
  .command('search <query>')
  .description('Search sessions by text')
  .option('-p, --project <name>', 'Filter by project')
  .option('--from <date>', 'From date (YYYY-MM-DD)')
  .option('--to <date>', 'To date (YYYY-MM-DD)')
  .option('--json', 'Output as JSON')
  .action(async (query, opts) => {
    const sessions = await loadSessions();
    const { sessions: results, total } = filterSessions(sessions, {
      query,
      project: opts.project,
      from: opts.from,
      to: opts.to,
      limit: 30,
    });

    if (opts.json) {
      const data = results.map(s => ({
        id: s.id,
        date: s.lastTimestamp,
        project: s.shortProject,
        title: s.displayTitle || s.title,
        messages: s.userMessageCount + s.assistantMessageCount,
        tier: s.tier,
        tierLabel: s.tierLabel,
      }));
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }

    if (results.length === 0) {
      console.log(chalk.yellow(`  No sessions found for "${query}"`));
      return;
    }

    const table = new Table({
      head: ['DATE', 'PROJECT', 'TITLE', 'MSGS', 'TIER', 'ID'].map(h => chalk.cyan(h)),
      colWidths: [18, 16, 38, 6, 18, 10],
      wordWrap: true,
    });

    for (const s of results) {
      table.push([
        formatDate(s.lastTimestamp),
        s.shortProject.slice(0, 14),
        (s.displayTitle || s.title).slice(0, 36),
        s.userMessageCount + s.assistantMessageCount,
        tierBadge(s.tier),
        s.id.slice(0, 8),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim(`  Found ${total} matches (showing ${results.length})`));
  });

// ── STATS ────────────────────────────────────────────────────────────────────

program
  .command('stats')
  .description('Show aggregated statistics')
  .option('-p, --project <name>', 'Filter by project')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const sessions = await loadSessions({ mode: 'fast' });
    const stats = computeStats(sessions, opts.project);

    if (opts.json) {
      process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
      return;
    }

    console.log(chalk.bold(`\n  ${BRAND} csesh \u2014 Statistics\n`));
    console.log(`  ${chalk.cyan('Total sessions:')}    ${stats.totalSessions}`);
    console.log(`  ${chalk.cyan('Total disk:')}        ${stats.totalSizeFormatted}`);
    console.log(`  ${chalk.cyan('Date range:')}        ${stats.firstDate?.slice(0, 10) || 'N/A'} \u2192 ${stats.lastDate?.slice(0, 10) || 'N/A'}`);
    console.log(`  ${chalk.cyan('Avg duration:')}      ${formatDuration(stats.avgDurationMs)}`);
    console.log();
    console.log(`  ${chalk.green('Keep:')} ${stats.tierDistribution[4]}  ${chalk.blue('Review:')} ${stats.tierDistribution[3]}  ${chalk.yellow('Suggested:')} ${stats.tierDistribution[2]}  ${chalk.red('Auto-delete:')} ${stats.tierDistribution[1]}`);
    console.log(`  ${chalk.cyan('Cleanup potential:')} ${stats.junkSizeFormatted}`);
    if (stats.favoritesCount > 0) console.log(`  ${chalk.yellow('\u2605')} ${stats.favoritesCount} favorites`);
    console.log();
    console.log(`  ${chalk.cyan('Messages:')}  ${stats.totalUserMessages.toLocaleString()} user, ${stats.totalAssistantMessages.toLocaleString()} assistant`);
    console.log(`  ${chalk.cyan('Tokens:')}    ${stats.tokens.input.toLocaleString()} in, ${stats.tokens.output.toLocaleString()} out, ${stats.tokens.cacheRead.toLocaleString()} cache read`);
    console.log(`  ${chalk.cyan('Est. cost:')} $${stats.totalCost.toFixed(2)}`);
    console.log();

    if (Object.keys(stats.modelCounts).length > 0) {
      console.log(chalk.bold('  Models:'));
      for (const [model, count] of Object.entries(stats.modelCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${model}: ${count} sessions`);
      }
      console.log();
    }

    if (stats.topProjects.length > 0) {
      console.log(chalk.bold('  Top Projects:'));
      const projTable = new Table({
        head: ['PROJECT', 'SESSIONS', 'SIZE'].map(h => chalk.cyan(h)),
        colWidths: [30, 10, 10],
      });
      for (const p of stats.topProjects.slice(0, 10)) {
        projTable.push([p.name, p.sessions, p.sizeFormatted]);
      }
      console.log(projTable.toString());
    }

    if (stats.topTags.length > 0) {
      console.log(chalk.bold('  Top Tags:'));
      console.log(`    ${stats.topTags.slice(0, 10).map(t => chalk.magenta(`#${t.tag}(${t.count})`)).join('  ')}`);
      console.log();
    }
  });

// ── COST ────────────────────────────────────────────────────────────────────

/**
 * Build an ASCII sparkline from an array of numbers.
 * Uses 8 unicode block characters for vertical resolution.
 */
function sparkline(values) {
  if (!values || values.length === 0) return '';
  const ticks = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => {
    const idx = Math.min(Math.round(((v - min) / range) * (ticks.length - 1)), ticks.length - 1);
    return ticks[idx];
  }).join('');
}

/**
 * Get the start of today, this week (Monday), and this month.
 */
function getTimePeriodBounds() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - mondayOffset);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return { today, weekStart, monthStart };
}

program
  .command('cost')
  .description('Show cost breakdown by time period')
  .option('-p, --project <name>', 'Filter by project')
  .option('--daily', 'Show daily breakdown for the last 30 days')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const sessions = await loadSessions({ mode: 'fast' });
    let filtered = sessions;
    if (opts.project) {
      const p = opts.project.toLowerCase();
      filtered = sessions.filter(s =>
        s.slug === opts.project ||
        s.shortProject.toLowerCase().includes(p) ||
        s.project.toLowerCase().includes(p)
      );
    }

    // Compute per-session cost
    const sessionCosts = filtered.map(s => {
      const model = s.models[0] || 'default';
      return {
        session: s,
        cost: estimateCost(s.tokenUsage, model),
        date: s.lastTimestamp ? new Date(s.lastTimestamp) : null,
        day: s.lastTimestamp ? s.lastTimestamp.slice(0, 10) : null,
      };
    }).filter(sc => sc.date);

    // Time period bounds
    const { today, weekStart, monthStart } = getTimePeriodBounds();

    const todayCost = sessionCosts
      .filter(sc => sc.date >= today)
      .reduce((sum, sc) => sum + sc.cost, 0);
    const weekCost = sessionCosts
      .filter(sc => sc.date >= weekStart)
      .reduce((sum, sc) => sum + sc.cost, 0);
    const monthCost = sessionCosts
      .filter(sc => sc.date >= monthStart)
      .reduce((sum, sc) => sum + sc.cost, 0);
    const allTimeCost = sessionCosts
      .reduce((sum, sc) => sum + sc.cost, 0);

    // Daily breakdown (last 30 days)
    const dailyCosts = {};
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    for (const sc of sessionCosts) {
      if (sc.date >= last30 && sc.day) {
        dailyCosts[sc.day] = (dailyCosts[sc.day] || 0) + sc.cost;
      }
    }

    // Build sorted daily array for last 30 days
    const dailyEntries = [];
    for (let d = new Date(last30); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dailyEntries.push({ date: key, cost: dailyCosts[key] || 0 });
    }

    // Sparkline for last 14 days
    const last14 = dailyEntries.slice(-14);
    const sparkValues = last14.map(e => e.cost);
    const spark = sparkline(sparkValues);

    if (opts.json) {
      const data = {
        project: opts.project || null,
        today: Math.round(todayCost * 10000) / 10000,
        thisWeek: Math.round(weekCost * 10000) / 10000,
        thisMonth: Math.round(monthCost * 10000) / 10000,
        allTime: Math.round(allTimeCost * 10000) / 10000,
        daily: dailyEntries.map(e => ({ date: e.date, cost: Math.round(e.cost * 10000) / 10000 })),
        sessions: sessionCosts.length,
      };
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }

    console.log(chalk.bold(`\n  ${BRAND} csesh \u2014 Cost Breakdown\n`));
    if (opts.project) {
      console.log(`  ${chalk.dim(`Project: ${opts.project}`)}\n`);
    }

    const costTable = new Table({
      head: ['PERIOD', 'COST', 'SESSIONS'].map(h => chalk.cyan(h)),
      colWidths: [20, 14, 12],
    });

    const todaySessions = sessionCosts.filter(sc => sc.date >= today).length;
    const weekSessions = sessionCosts.filter(sc => sc.date >= weekStart).length;
    const monthSessions = sessionCosts.filter(sc => sc.date >= monthStart).length;

    costTable.push(
      ['Today', chalk.green(`$${todayCost.toFixed(2)}`), todaySessions],
      ['This week', chalk.green(`$${weekCost.toFixed(2)}`), weekSessions],
      ['This month', chalk.green(`$${monthCost.toFixed(2)}`), monthSessions],
      ['All time', chalk.bold.green(`$${allTimeCost.toFixed(2)}`), sessionCosts.length],
    );

    console.log(costTable.toString());

    // Sparkline
    console.log();
    console.log(`  ${chalk.bold('Last 14 days:')} ${chalk.cyan(spark)}`);
    const minDay = Math.min(...sparkValues);
    const maxDay = Math.max(...sparkValues);
    console.log(`  ${chalk.dim(`$${minDay.toFixed(2)} .. $${maxDay.toFixed(2)}`)}`);

    // Daily breakdown
    if (opts.daily) {
      console.log();
      console.log(chalk.bold('  Daily Breakdown (last 30 days)\n'));
      const dailyTable = new Table({
        head: ['DATE', 'COST', 'BAR'].map(h => chalk.cyan(h)),
        colWidths: [14, 12, 40],
      });

      const maxCost = Math.max(...dailyEntries.map(e => e.cost), 0.01);
      for (const entry of dailyEntries) {
        const barLen = Math.round((entry.cost / maxCost) * 30);
        const bar = entry.cost > 0 ? chalk.cyan('\u2588'.repeat(barLen)) : chalk.dim('\u00b7');
        const isToday = entry.date === new Date().toISOString().slice(0, 10);
        const dateStr = isToday ? chalk.bold(entry.date) : entry.date;
        dailyTable.push([
          dateStr,
          entry.cost > 0 ? `$${entry.cost.toFixed(2)}` : chalk.dim('$0.00'),
          bar,
        ]);
      }
      console.log(dailyTable.toString());
    }

    console.log();
  });

// ── DOCTOR ──────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Health check and diagnostics')
  .action(async () => {
    const checks = [];
    const ok = (label, detail) => checks.push({ status: 'ok', label, detail });
    const fail = (label, detail) => checks.push({ status: 'fail', label, detail });
    const warn = (label, detail) => checks.push({ status: 'warn', label, detail });

    console.log(chalk.bold(`\n  ${BRAND} csesh doctor\n`));

    // 1. Check Claude Code directory
    try {
      const info = await fsStat(CLAUDE_DIR);
      if (info.isDirectory()) {
        ok('Claude Code directory', CLAUDE_DIR);
      } else {
        fail('Claude Code directory', `${CLAUDE_DIR} is not a directory`);
      }
    } catch {
      fail('Claude Code directory', `${CLAUDE_DIR} not found`);
    }

    // 2. Check projects directory
    let projectCount = 0;
    try {
      const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
      projectCount = entries.filter(e => e.isDirectory()).length;
      ok('Projects directory', `${PROJECTS_DIR} (${projectCount} projects)`);
    } catch {
      fail('Projects directory', `${PROJECTS_DIR} not found`);
    }

    // 3. Count session files
    try {
      const files = await findSessionFiles();
      ok('Session files', `${files.length} sessions found`);

      // 3b. Disk usage
      let totalBytes = 0;
      for (const f of files) {
        try {
          const info = await fsStat(f.filePath);
          totalBytes += info.size;
        } catch { /* skip */ }
      }
      ok('Disk usage (sessions)', formatBytes(totalBytes));
    } catch (err) {
      fail('Session files', `Error scanning: ${err.message}`);
    }

    // 4. Cache integrity
    try {
      const { readFile } = await import('fs/promises');
      const raw = await readFile(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const entryCount = Object.keys(parsed.sessions || {}).length;
      const cacheInfo = await fsStat(CACHE_FILE);
      ok('Cache file', `${entryCount} entries, ${formatBytes(cacheInfo.size)}`);

      // Check for orphaned cache entries
      const sessionFiles = await findSessionFiles();
      const filePaths = new Set(sessionFiles.map(f => f.filePath));
      let orphaned = 0;
      for (const key of Object.keys(parsed.sessions || {})) {
        if (!filePaths.has(key)) orphaned++;
      }
      if (orphaned > 0) {
        warn('Orphaned cache entries', `${orphaned} entries reference missing files`);
      } else {
        ok('Cache integrity', 'No orphaned entries');
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        warn('Cache file', 'Not found (will be created on first scan)');
      } else {
        fail('Cache file', `Parse error: ${err.message}`);
      }
    }

    // 5. Metadata integrity
    try {
      const meta = await loadMetadata();
      const metaCount = Object.keys(meta.sessions || {}).length;
      ok('Metadata file', `${metaCount} session entries`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        warn('Metadata file', 'Not found (will be created when needed)');
      } else {
        fail('Metadata file', `Parse error: ${err.message}`);
      }
    }

    // 6. Versions
    ok('csesh version', `v${VERSION}`);
    ok('Node.js version', process.version);

    // Display results
    for (const check of checks) {
      if (check.status === 'ok') {
        console.log(`  ${chalk.green('\u2713')} ${chalk.bold(check.label)}  ${chalk.dim(check.detail)}`);
      } else if (check.status === 'warn') {
        console.log(`  ${chalk.yellow('!')} ${chalk.bold(check.label)}  ${chalk.yellow(check.detail)}`);
      } else {
        console.log(`  ${chalk.red('\u2717')} ${chalk.bold(check.label)}  ${chalk.red(check.detail)}`);
      }
    }

    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;

    console.log();
    if (failCount > 0) {
      console.log(chalk.red(`  ${failCount} issue(s) found.`));
    } else if (warnCount > 0) {
      console.log(chalk.yellow(`  ${warnCount} warning(s), no critical issues.`));
    } else {
      console.log(chalk.green('  All checks passed.'));
    }
    console.log();
  });

// ── CLEANUP ──────────────────────────────────────────────────────────────────

program
  .command('cleanup')
  .description('Identify and trash junk sessions (by tier)')
  .option('--dry-run', 'Show what would be trashed without doing it')
  .option('--tier1-only', 'Only auto-delete tier 1 (100% safe)')
  .action(async (opts) => {
    const sessions = await loadSessions();

    const tier1 = sessions.filter(s => s.tier === 1);
    const tier2 = sessions.filter(s => s.tier === 2);

    if (tier1.length === 0 && tier2.length === 0) {
      console.log(chalk.green(`  \u2713 No junk sessions found!`));
      return;
    }

    // Show Tier 1
    if (tier1.length > 0) {
      const size1 = tier1.reduce((s, x) => s + x.fileSizeBytes, 0);
      console.log(chalk.bold(`\n  Tier 1 \u2014 Auto-delete (${tier1.length} sessions, ${formatBytes(size1)})`));
      console.log(chalk.dim('  Empty, hook-only, or snapshot-only sessions. 100% safe to remove.\n'));

      const table1 = new Table({
        head: ['DATE', 'PROJECT', 'REASON', 'SIZE'].map(h => chalk.cyan(h)),
        colWidths: [14, 16, 40, 8],
        wordWrap: true,
      });
      for (const s of tier1.slice(0, 20)) {
        table1.push([
          s.lastTimestamp?.slice(0, 10) || 'N/A',
          s.shortProject.slice(0, 14),
          s.junkReasons.join(', ').slice(0, 38),
          formatBytes(s.fileSizeBytes),
        ]);
      }
      console.log(table1.toString());
      if (tier1.length > 20) console.log(chalk.dim(`  ... and ${tier1.length - 20} more`));
    }

    // Show Tier 2
    if (tier2.length > 0 && !opts.tier1Only) {
      const size2 = tier2.reduce((s, x) => s + x.fileSizeBytes, 0);
      console.log(chalk.bold(`\n  Tier 2 \u2014 Suggested delete (${tier2.length} sessions, ${formatBytes(size2)})`));
      console.log(chalk.dim('  Short/abandoned sessions. Quick review recommended.\n'));

      const table2 = new Table({
        head: ['DATE', 'PROJECT', 'TITLE', 'REASON', 'SIZE'].map(h => chalk.cyan(h)),
        colWidths: [14, 14, 25, 25, 8],
        wordWrap: true,
      });
      for (const s of tier2.slice(0, 15)) {
        table2.push([
          s.lastTimestamp?.slice(0, 10) || 'N/A',
          s.shortProject.slice(0, 12),
          (s.displayTitle || s.title).slice(0, 23),
          s.junkReasons.join(', ').slice(0, 23),
          formatBytes(s.fileSizeBytes),
        ]);
      }
      console.log(table2.toString());
      if (tier2.length > 15) console.log(chalk.dim(`  ... and ${tier2.length - 15} more`));
    }

    if (opts.dryRun) {
      const totalSize = [...tier1, ...(opts.tier1Only ? [] : tier2)].reduce((s, x) => s + x.fileSizeBytes, 0);
      console.log(chalk.yellow(`\n  Dry run: would trash ${tier1.length + (opts.tier1Only ? 0 : tier2.length)} sessions (${formatBytes(totalSize)})`));
      return;
    }

    // Confirm Tier 1
    const readline = await import('readline');
    if (tier1.length > 0) {
      const rl1 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ans1 = await new Promise(resolve => {
        rl1.question(chalk.yellow(`\n  Trash ${tier1.length} Tier 1 sessions? (y/N) `), resolve);
      });
      rl1.close();

      if (ans1.toLowerCase() === 'y') {
        let trashed = 0;
        let skipped = 0;
        for (const s of tier1) {
          try { await trashSession(s, 'cleanup-tier1'); trashed++; } catch { skipped++; }
        }
        console.log(chalk.green(`  \u2713 Trashed ${trashed} Tier 1 sessions`) + (skipped > 0 ? chalk.yellow(` (${skipped} skipped due to errors)`) : ''));
      }
    }

    // Confirm Tier 2
    if (tier2.length > 0 && !opts.tier1Only) {
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ans2 = await new Promise(resolve => {
        rl2.question(chalk.yellow(`  Also trash ${tier2.length} Tier 2 sessions? (y/N) `), resolve);
      });
      rl2.close();

      if (ans2.toLowerCase() === 'y') {
        let trashed = 0;
        let skipped = 0;
        for (const s of tier2) {
          try { await trashSession(s, 'cleanup-tier2'); trashed++; } catch { skipped++; }
        }
        console.log(chalk.green(`  \u2713 Trashed ${trashed} Tier 2 sessions`) + (skipped > 0 ? chalk.yellow(` (${skipped} skipped due to errors)`) : ''));
      }
    }

    await clearCache();
    console.log(chalk.dim('\n  Use "csesh trash list" to review, "csesh trash restore <id>" to undo'));
  });

// ── TAG ──────────────────────────────────────────────────────────────────────

program
  .command('tag <id> <tag>')
  .description('Add a tag to a session')
  .action(async (id, tag) => {
    const sessions = await loadSessions({ showProgress: false });
    const session = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!session) {
      console.log(chalk.red(`  \u2717 Session not found: ${id}`));
      process.exit(1);
    }
    await metaAddTag(session.id, tag);
    console.log(chalk.green(`  \u2713 Tagged ${session.id.slice(0, 8)} with ${chalk.magenta('#' + tag)}`));
  });

// ── TITLE ────────────────────────────────────────────────────────────────────

program
  .command('title <id> <title>')
  .description('Set a custom title for a session')
  .action(async (id, title) => {
    const sessions = await loadSessions({ showProgress: false });
    const session = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!session) {
      console.log(chalk.red(`  \u2717 Session not found: ${id}`));
      process.exit(1);
    }
    await metaSetTitle(session.id, title);
    console.log(chalk.green(`  \u2713 Title updated`));
  });

// ── EXPORT ───────────────────────────────────────────────────────────────────

program
  .command('export')
  .description('Export session data')
  .option('-f, --format <fmt>', 'Format: json, csv', 'json')
  .option('-o, --output <file>', 'Output file (stdout if omitted)')
  .option('--session <id>', 'Export single session conversation as markdown')
  .action(async (opts) => {
    // Validate output path if specified
    if (opts.output) {
      const { stat: fsStat } = await import('fs/promises');
      const { dirname: pathDirname, resolve: pathResolve } = await import('path');

      const outputPath = pathResolve(opts.output);

      // Check for suspicious characters
      if (/[<>|"'\x00-\x1f]/.test(opts.output)) {
        console.log(chalk.red(`  \u2717 Output path contains invalid characters: ${opts.output}`));
        process.exit(1);
      }

      // Check output directory exists
      const outputDir = pathDirname(outputPath);
      try {
        const dirInfo = await fsStat(outputDir);
        if (!dirInfo.isDirectory()) {
          console.log(chalk.red(`  \u2717 Output directory is not a directory: ${outputDir}`));
          process.exit(1);
        }
      } catch {
        console.log(chalk.red(`  \u2717 Output directory does not exist: ${outputDir}`));
        process.exit(1);
      }

      // Warn if file already exists
      try {
        await fsStat(outputPath);
        console.log(chalk.yellow(`  Warning: ${outputPath} already exists and will be overwritten`));
      } catch { /* file does not exist, good */ }
    }

    if (opts.session) {
      // Export single session as markdown
      const sessions = await loadSessions({ showProgress: false });
      const session = sessions.find(s => s.id === opts.session || s.id.startsWith(opts.session));
      if (!session) {
        console.log(chalk.red(`  \u2717 Session not found: ${opts.session}`));
        process.exit(1);
      }
      const { messages } = await readMessages(session.filePath, { limit: 10000 });
      let md = `# ${session.displayTitle || session.title}\n\n`;
      md += `- **Project:** ${session.shortProject}\n`;
      md += `- **Date:** ${formatDate(session.firstTimestamp)}\n`;
      md += `- **Duration:** ${formatDuration(session.durationMs)}\n\n---\n\n`;
      for (const msg of messages) {
        const role = msg.type === 'user' ? '**User**' : '**Assistant**';
        md += `### ${role}\n\n${msg.content || '(no text)'}\n\n---\n\n`;
      }
      if (opts.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(opts.output, md);
        console.log(chalk.green(`  \u2713 Exported to ${opts.output}`));
      } else {
        process.stdout.write(md);
      }
      return;
    }

    const sessions = await loadSessions();
    if (opts.format === 'csv') {
      const headers = 'id,date,project,title,tier,messages,size,duration,models,cost\n';
      const rows = sessions.map(s => {
        const model = s.models[0] || '';
        const cost = estimateCost(s.tokenUsage, model).toFixed(4);
        return [
          s.id,
          s.lastTimestamp?.slice(0, 10) || '',
          `"${s.shortProject}"`,
          `"${(s.displayTitle || s.title).replace(/"/g, '""')}"`,
          s.tierLabel || '',
          s.userMessageCount + s.assistantMessageCount,
          s.fileSizeBytes,
          s.durationMs,
          `"${s.models.join(', ')}"`,
          cost,
        ].join(',');
      }).join('\n');
      const csv = headers + rows;
      if (opts.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(opts.output, csv);
        console.log(chalk.green(`  \u2713 Exported ${sessions.length} sessions to ${opts.output}`));
      } else {
        process.stdout.write(csv);
      }
    } else {
      const data = JSON.stringify(sessions, null, 2);
      if (opts.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(opts.output, data);
        console.log(chalk.green(`  \u2713 Exported ${sessions.length} sessions to ${opts.output}`));
      } else {
        process.stdout.write(data);
      }
    }
  });

// ── RESUME ──────────────────────────────────────────────────────────────────

program
  .command('resume')
  .description('Pick a session and resume it in Claude Code')
  .option('-p, --project <name>', 'Filter by project')
  .option('-n, --limit <n>', 'Number of sessions to show', parseInt, 20)
  .option('--favorites', 'Show only favorites')
  .option('--tag <tag>', 'Filter by tag')
  .action(async (opts) => {
    const sessions = await loadSessions({ project: opts.project });

    const { sessions: filtered } = filterSessions(sessions, {
      project: opts.project,
      tag: opts.tag,
      favorite: opts.favorites || null,
      sort: 'date',
      limit: opts.limit,
    });

    if (filtered.length === 0) {
      console.log(chalk.yellow('  No sessions found'));
      return;
    }

    console.log(`\n  ${BRAND} ${chalk.bold('csesh resume')}\n`);

    for (let i = 0; i < filtered.length; i++) {
      const s = filtered[i];
      const num = String(i + 1).padStart(3);
      const fav = s.favorite ? chalk.yellow('\u2605') : ' ';
      const badge = tierBadge(s.tier);
      const title = (s.displayTitle || s.title).slice(0, 50);
      const tags = (s.tags || []).slice(0, 3).map(t => chalk.magenta(`#${t}`)).join(' ');
      const date = s.lastTimestamp?.slice(0, 10) || '';

      console.log(`  ${chalk.dim(num)}  ${fav} ${badge}  ${title} ${tags}`);
      console.log(`       ${chalk.dim(s.shortProject)} ${chalk.dim('\u00b7')} ${chalk.dim(date)}`);
    }

    console.log();

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question(chalk.cyan(`  Select session (1-${filtered.length}): `), resolve);
    });
    rl.close();

    const idx = parseInt(answer) - 1;
    if (isNaN(idx) || idx < 0 || idx >= filtered.length) {
      console.log(chalk.red('  \u2717 Invalid selection'));
      process.exit(1);
    }

    const selected = filtered[idx];
    console.log(chalk.green(`  \u2713 Resuming: ${selected.displayTitle || selected.title}`));
    console.log();

    const { execSync } = await import('child_process');
    try {
      execSync(`claude --resume ${selected.id}`, { stdio: 'inherit' });
    } catch {
      // claude exits with non-zero on user interrupt, that's fine
    }
  });

// ── TRASH ────────────────────────────────────────────────────────────────────

const trashCmd = program.command('trash').description('Manage trashed sessions');

trashCmd.command('list').description('List trashed sessions').action(async () => {
  const items = await listTrash();
  if (items.length === 0) {
    console.log(chalk.dim('  Trash is empty'));
    return;
  }

  const table = new Table({
    head: ['TRASHED', 'PROJECT', 'TITLE', 'SCORE', 'SIZE', 'ID'].map(h => chalk.cyan(h)),
    colWidths: [14, 14, 35, 7, 8, 10],
    wordWrap: true,
  });

  for (const item of items) {
    table.push([
      item.trashedAt?.slice(0, 10) || 'N/A',
      (item.project || '').slice(0, 12),
      (item.title || '').slice(0, 33),
      (item.junkScore || 0).toFixed(1),
      formatBytes(item.fileSizeBytes || 0),
      item.id.slice(0, 8),
    ]);
  }

  console.log(table.toString());
  console.log(chalk.dim(`  ${items.length} items in trash`));
});

trashCmd.command('restore <id>').description('Restore a session from trash').action(async (id) => {
  try {
    const items = await listTrash();
    const match = items.find(i => i.id === id || i.id.startsWith(id));
    if (!match) {
      console.log(chalk.red(`  \u2717 Session not found in trash: ${id}`));
      process.exit(1);
    }
    const result = await restoreSession(match.id);
    console.log(chalk.green(`  \u2713 Restored ${result.id} \u2192 ${result.restoredTo}`));
    await clearCache();
  } catch (err) {
    console.log(chalk.red(`  \u2717 Error: ${err.message}`));
  }
});

trashCmd.command('delete <id>').description('Permanently delete a session from trash').action(async (id) => {
  try {
    const items = await listTrash();
    const match = items.find(i => i.id === id || i.id.startsWith(id));
    if (!match) {
      console.log(chalk.red(`  \u2717 Session not found in trash: ${id}`));
      process.exit(1);
    }

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(resolve => {
      rl.question(chalk.yellow(`  Permanently delete "${match.title || match.id}"? This cannot be undone. (y/N) `), resolve);
    });
    rl.close();

    if (ans.toLowerCase() !== 'y') {
      console.log(chalk.dim('  Cancelled'));
      return;
    }

    await deleteFromTrash(match.id);
    console.log(chalk.green(`  \u2713 Permanently deleted ${match.id.slice(0, 8)}`));
  } catch (err) {
    console.log(chalk.red(`  \u2717 Error: ${err.message}`));
  }
});

trashCmd.command('empty').description('Permanently delete old trashed sessions')
  .option('--older-than <days>', 'Days threshold (0 = all)', parseInt, 30)
  .action(async (opts) => {
    const result = await emptyTrash(opts.olderThan);
    console.log(chalk.green(`  \u2713 Removed ${result.removed} items, ${result.remaining} remaining`));
  });

// ── WEB ──────────────────────────────────────────────────────────────────────

program.command('web').description('Start web dashboard')
  .option('-p, --port <n>', 'Port number', parseInt, 3456)
  .action(async (opts) => {
    const { startServer } = await import('../web/server.js');
    await startServer(opts.port);
  });

// ── CACHE ────────────────────────────────────────────────────────────────────

const cacheCmd = program.command('cache').description('Manage scan cache');

cacheCmd.command('clear').description('Clear the scan cache').action(async () => {
  await clearCache();
  console.log(chalk.green('  \u2713 Cache cleared'));
});

cacheCmd.command('stats').description('Show cache statistics').action(async () => {
  const stats = await cacheStats();
  console.log(`  ${chalk.cyan('Entries:')}  ${stats.entries} (${stats.analyzed} analyzed)`);
  console.log(`  ${chalk.cyan('Disk:')}     ${formatBytes(stats.diskSize)}`);
});

// ── Run ─────────────────────────────────────────────────────────────────────

await checkFirstRun();
program.parse();
