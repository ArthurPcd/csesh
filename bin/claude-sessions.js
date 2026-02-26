#!/usr/bin/env node

/**
 * Claude Sessions Organizer
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/claude-sessions-organizer
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { findSessionFiles, fullScan, fastScan, readMessages } from '../lib/scanner.js';
import { getCached, setCached, flushCache, clearCache, cacheStats } from '../lib/cache.js';
import { classifyAll, junkLabel, tierLabel, TIER_LABELS } from '../lib/classifier.js';
import { filterSessions } from '../lib/search.js';
import { computeStats } from '../lib/stats.js';
import { trashSession, restoreSession, listTrash, emptyTrash } from '../lib/cleanup.js';
import { mergeMetadata, setTitle as metaSetTitle, addTag as metaAddTag, removeTag as metaRemoveTag, toggleFavorite, setNote, getAllTags } from '../lib/metadata.js';
import { formatBytes, formatDuration, formatDate, timeAgo, estimateCost } from '../lib/utils.js';
import { getConfig } from '../lib/config.js';

const program = new Command();
program
  .name('claude-sessions')
  .description('Navigate, search, clean up and analyze Claude Code sessions')
  .version('1.0.0');

// ── Session loading ──────────────────────────────────────────────────────────

async function loadSessions({ project = null, mode = 'fast', showProgress = true, analyze = false } = {}) {
  const files = await findSessionFiles(project);
  const results = [];
  let cached = 0;
  let scanned = 0;

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
      } catch { return null; }
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

    const table = new Table({
      head: ['Date', 'Project', 'Title', 'Msgs', 'Size', 'Tier', 'ID'].map(h => chalk.cyan(h)),
      colWidths: [18, 16, 38, 6, 8, 18, 10],
      wordWrap: true,
    });

    for (const s of filtered) {
      const fav = s.favorite ? chalk.yellow('★ ') : '';
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
  .action(async (id) => {
    const sessions = await loadSessions({ showProgress: false });
    const session = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!session) {
      console.log(chalk.red(`Session not found: ${id}`));
      process.exit(1);
    }

    console.log(chalk.bold('\n  Session Details\n'));
    console.log(`  ${chalk.cyan('ID:')}        ${session.id}`);
    console.log(`  ${chalk.cyan('Title:')}     ${session.displayTitle || session.title}`);
    if (session.customTitle) console.log(`  ${chalk.cyan('Original:')}  ${session.title}`);
    console.log(`  ${chalk.cyan('Project:')}   ${session.project}`);
    console.log(`  ${chalk.cyan('Date:')}      ${formatDate(session.firstTimestamp)} → ${formatDate(session.lastTimestamp)}`);
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
    if (session.favorite) console.log(`  ${chalk.cyan('Favorite:')}  ${chalk.yellow('★ Yes')}`);
    if (session.notes) console.log(`  ${chalk.cyan('Notes:')}     ${session.notes}`);
    console.log(`  ${chalk.cyan('Branch:')}    ${session.gitBranch || 'N/A'}`);
    console.log(`  ${chalk.cyan('CWD:')}       ${session.cwd || 'N/A'}`);
    console.log(`  ${chalk.cyan('Version:')}   ${session.version || 'N/A'}`);
    console.log(`  ${chalk.cyan('Models:')}    ${session.models.join(', ') || 'N/A'}`);
    console.log(`  ${chalk.cyan('Tokens:')}    ${session.tokenUsage.input.toLocaleString()} in, ${session.tokenUsage.output.toLocaleString()} out, ${session.tokenUsage.cacheRead.toLocaleString()} cached`);

    const model = session.models[0] || 'default';
    const cost = estimateCost(session.tokenUsage, model);
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
        console.log(chalk.red(`Session not found: ${id}`));
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
          const bar = chalk.cyan('█'.repeat(barLen));
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
          console.log(`    ${tool.padEnd(15)} ${String(count).padStart(5)}  ${chalk.cyan('█'.repeat(barLen))}`);
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
  .action(async (query, opts) => {
    const sessions = await loadSessions();
    const { sessions: results, total } = filterSessions(sessions, {
      query,
      project: opts.project,
      from: opts.from,
      to: opts.to,
      limit: 30,
    });

    if (results.length === 0) {
      console.log(chalk.yellow(`  No sessions found for "${query}"`));
      return;
    }

    const table = new Table({
      head: ['Date', 'Project', 'Title', 'Msgs', 'Tier', 'ID'].map(h => chalk.cyan(h)),
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
  .action(async (opts) => {
    const sessions = await loadSessions({ mode: 'fast' });
    const stats = computeStats(sessions, opts.project);

    console.log(chalk.bold('\n  Claude Sessions Statistics\n'));
    console.log(`  ${chalk.cyan('Total sessions:')}    ${stats.totalSessions}`);
    console.log(`  ${chalk.cyan('Total disk:')}        ${stats.totalSizeFormatted}`);
    console.log(`  ${chalk.cyan('Date range:')}        ${stats.firstDate?.slice(0, 10) || 'N/A'} → ${stats.lastDate?.slice(0, 10) || 'N/A'}`);
    console.log(`  ${chalk.cyan('Avg duration:')}      ${formatDuration(stats.avgDurationMs)}`);
    console.log();
    console.log(`  ${chalk.green('Keep:')} ${stats.tierDistribution[4]}  ${chalk.blue('Review:')} ${stats.tierDistribution[3]}  ${chalk.yellow('Suggested:')} ${stats.tierDistribution[2]}  ${chalk.red('Auto-delete:')} ${stats.tierDistribution[1]}`);
    console.log(`  ${chalk.cyan('Cleanup potential:')} ${stats.junkSizeFormatted}`);
    if (stats.favoritesCount > 0) console.log(`  ${chalk.yellow('★')} ${stats.favoritesCount} favorites`);
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
        head: ['Project', 'Sessions', 'Size'].map(h => chalk.cyan(h)),
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
      console.log(chalk.green('  No junk sessions found!'));
      return;
    }

    // Show Tier 1
    if (tier1.length > 0) {
      const size1 = tier1.reduce((s, x) => s + x.fileSizeBytes, 0);
      console.log(chalk.bold(`\n  Tier 1 — Auto-delete (${tier1.length} sessions, ${formatBytes(size1)})`));
      console.log(chalk.dim('  Empty, hook-only, or snapshot-only sessions. 100% safe to remove.\n'));

      const table1 = new Table({
        head: ['Date', 'Project', 'Reason', 'Size'].map(h => chalk.cyan(h)),
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
      console.log(chalk.bold(`\n  Tier 2 — Suggested delete (${tier2.length} sessions, ${formatBytes(size2)})`));
      console.log(chalk.dim('  Short/abandoned sessions. Quick review recommended.\n'));

      const table2 = new Table({
        head: ['Date', 'Project', 'Title', 'Reason', 'Size'].map(h => chalk.cyan(h)),
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
        for (const s of tier1) {
          try { await trashSession(s, 'cleanup-tier1'); trashed++; } catch {}
        }
        console.log(chalk.green(`  Trashed ${trashed} Tier 1 sessions`));
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
        for (const s of tier2) {
          try { await trashSession(s, 'cleanup-tier2'); trashed++; } catch {}
        }
        console.log(chalk.green(`  Trashed ${trashed} Tier 2 sessions`));
      }
    }

    await clearCache();
    console.log(chalk.dim('\n  Use "claude-sessions trash list" to review, "trash restore <id>" to undo'));
  });

// ── TAG ──────────────────────────────────────────────────────────────────────

program
  .command('tag <id> <tag>')
  .description('Add a tag to a session')
  .action(async (id, tag) => {
    const sessions = await loadSessions({ showProgress: false });
    const session = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!session) {
      console.log(chalk.red(`Session not found: ${id}`));
      process.exit(1);
    }
    await metaAddTag(session.id, tag);
    console.log(chalk.green(`  Tagged ${session.id.slice(0, 8)} with ${chalk.magenta('#' + tag)}`));
  });

// ── TITLE ────────────────────────────────────────────────────────────────────

program
  .command('title <id> <title>')
  .description('Set a custom title for a session')
  .action(async (id, title) => {
    const sessions = await loadSessions({ showProgress: false });
    const session = sessions.find(s => s.id === id || s.id.startsWith(id));
    if (!session) {
      console.log(chalk.red(`Session not found: ${id}`));
      process.exit(1);
    }
    await metaSetTitle(session.id, title);
    console.log(chalk.green(`  Title set: "${title}"`));
  });

// ── EXPORT ───────────────────────────────────────────────────────────────────

program
  .command('export')
  .description('Export session data')
  .option('-f, --format <fmt>', 'Format: json, csv', 'json')
  .option('-o, --output <file>', 'Output file (stdout if omitted)')
  .option('--session <id>', 'Export single session conversation as markdown')
  .action(async (opts) => {
    if (opts.session) {
      // Export single session as markdown
      const sessions = await loadSessions({ showProgress: false });
      const session = sessions.find(s => s.id === opts.session || s.id.startsWith(opts.session));
      if (!session) {
        console.log(chalk.red(`Session not found: ${opts.session}`));
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
        console.log(chalk.green(`  Exported to ${opts.output}`));
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
        console.log(chalk.green(`  Exported ${sessions.length} sessions to ${opts.output}`));
      } else {
        process.stdout.write(csv);
      }
    } else {
      const data = JSON.stringify(sessions, null, 2);
      if (opts.output) {
        const { writeFile } = await import('fs/promises');
        await writeFile(opts.output, data);
        console.log(chalk.green(`  Exported ${sessions.length} sessions to ${opts.output}`));
      } else {
        process.stdout.write(data);
      }
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
    head: ['Trashed', 'Project', 'Title', 'Score', 'Size', 'ID'].map(h => chalk.cyan(h)),
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
      console.log(chalk.red(`  Session not found in trash: ${id}`));
      process.exit(1);
    }
    const result = await restoreSession(match.id);
    console.log(chalk.green(`  Restored ${result.id} → ${result.restoredTo}`));
    await clearCache();
  } catch (err) {
    console.log(chalk.red(`  Error: ${err.message}`));
  }
});

trashCmd.command('empty').description('Permanently delete old trashed sessions')
  .option('--older-than <days>', 'Days threshold', parseInt, 30)
  .action(async (opts) => {
    const result = await emptyTrash(opts.olderThan);
    console.log(chalk.green(`  Removed ${result.removed} items, ${result.remaining} remaining`));
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
  console.log(chalk.green('  Cache cleared'));
});

cacheCmd.command('stats').description('Show cache statistics').action(async () => {
  const stats = await cacheStats();
  console.log(`  ${chalk.cyan('Entries:')}  ${stats.entries} (${stats.analyzed} analyzed)`);
  console.log(`  ${chalk.cyan('Disk:')}     ${formatBytes(stats.diskSize)}`);
});

program.parse();
