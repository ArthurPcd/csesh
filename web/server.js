/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findSessionFiles, fullScan, fastScan, readMessages, listProjects } from '../lib/scanner.js';
import { getCached, setCached, flushCache, clearCache } from '../lib/cache.js';
import { classifyAll, junkLabel } from '../lib/classifier.js';
import { filterSessions } from '../lib/search.js';
import { computeStats } from '../lib/stats.js';
import { trashSession, restoreSession, listTrash, deleteFromTrash } from '../lib/cleanup.js';
import { mergeMetadata, setTitle, addTag, removeTag, toggleFavorite, setNote, setTierOverride, getAllTags, batchSetTag, loadMetadata } from '../lib/metadata.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let sessionsCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 30_000;

async function getSessions(forceRefresh = false) {
  if (!forceRefresh && sessionsCache && Date.now() - lastLoadTime < CACHE_TTL) {
    return sessionsCache;
  }

  const files = await findSessionFiles();
  const results = [];

  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const batchResults = await Promise.all(batch.map(async f => {
      const cached = await getCached(f.filePath);
      if (cached) return cached;
      try {
        const summary = await fastScan(f);
        await setCached(f.filePath, summary);
        return summary;
      } catch { return null; }
    }));
    results.push(...batchResults.filter(Boolean));
  }

  await flushCache();
  classifyAll(results);

  // Merge user metadata (titles, tags, favorites, notes)
  await mergeMetadata(results);

  results.sort((a, b) => {
    if (!a.lastTimestamp) return 1;
    if (!b.lastTimestamp) return -1;
    return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
  });

  sessionsCache = results;
  lastLoadTime = Date.now();
  return results;
}

function invalidateCache() {
  sessionsCache = null;
  lastLoadTime = 0;
}

function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  const params = {};
  for (const [k, v] of u.searchParams) params[k] = v;
  return params;
}

function corsOrigin(req) {
  const origin = req?.headers?.origin;
  if (!origin) return '*'; // same-origin requests (no Origin header)
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin;
  } catch { /* invalid origin */ }
  return ''; // deny cross-origin from non-localhost
}

function json(res, data, status = 200, req = null) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin(req),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const MAX_BODY_SIZE = 1_048_576; // 1MB

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  // Request-scoped json helper (always includes CORS from this request)
  const send = (data, status = 200) => json(res, data, status, req);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin(req),
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // ── Dashboard ────────────────────────────────────────────────
    if (path === '/' && method === 'GET') {
      const html = await readFile(join(__dirname, 'dashboard.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // ── Vendor static files (local CDN replacements) ──────────
    const vendorMatch = path.match(/^\/vendor\/([a-z0-9.-]+\.js)$/);
    if (vendorMatch && method === 'GET') {
      const filename = vendorMatch[1];
      try {
        const content = await readFile(join(__dirname, 'vendor', filename));
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        res.end(content);
      } catch {
        send({ error: 'Not found' }, 404);
      }
      return;
    }

    // ── Sessions list ────────────────────────────────────────────
    if (path === '/api/sessions' && method === 'GET') {
      const params = parseQuery(req.url);
      const sessions = await getSessions();
      const result = filterSessions(sessions, {
        project: params.project || null,
        category: params.category || null,
        tier: params.tier || null,
        tag: params.tag || null,
        favorite: params.favorite === 'true' || null,
        sort: params.sort || 'date',
        query: params.q || null,
        limit: parseInt(params.limit) || 50,
        offset: parseInt(params.offset) || 0,
      });
      send(result);
      return;
    }

    // ── Session detail ───────────────────────────────────────────
    const sessionMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)$/);
    if (sessionMatch && method === 'GET') {
      const id = sessionMatch[1];
      const sessions = await getSessions();
      const session = sessions.find(s => s.id === id || s.id.startsWith(id));
      if (!session) return send({ error: 'Not found' }, 404);

      // If not deeply analyzed yet, do a full scan
      if (!session.analyzed) {
        try {
          const files = await findSessionFiles();
          const file = files.find(f => f.id === session.id);
          if (file) {
            const deep = await fullScan(file, { analyze: true });
            classifyAll([deep]);
            await mergeMetadata([deep]);
            await setCached(file.filePath, deep);
            await flushCache();
            send(deep);
            return;
          }
        } catch { /* fall through to basic data */ }
      }
      send(session);
      return;
    }

    // ── Session messages ─────────────────────────────────────────
    const msgMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)\/messages$/);
    if (msgMatch && method === 'GET') {
      const id = msgMatch[1];
      const sessions = await getSessions();
      const session = sessions.find(s => s.id === id || s.id.startsWith(id));
      if (!session) return send({ error: 'Not found' }, 404);
      const params = parseQuery(req.url);
      const messages = await readMessages(session.filePath, {
        offset: parseInt(params.offset) || 0,
        limit: parseInt(params.limit) || 200,
      });
      send(messages);
      return;
    }

    // ── Update session metadata ──────────────────────────────────
    const metaMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)\/meta$/);
    if (metaMatch && method === 'PATCH') {
      const id = metaMatch[1];
      const body = await readBody(req);
      if (body.customTitle !== undefined) await setTitle(id, body.customTitle);
      if (body.notes !== undefined) await setNote(id, body.notes);
      invalidateCache();
      send({ ok: true });
      return;
    }

    // ── Add tag ──────────────────────────────────────────────────
    const tagAddMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)\/tags$/);
    if (tagAddMatch && method === 'POST') {
      const id = tagAddMatch[1];
      const body = await readBody(req);
      if (!body.tag) return send({ error: 'Missing tag' }, 400);
      await addTag(id, body.tag);
      invalidateCache();
      send({ ok: true });
      return;
    }

    // ── Remove tag ───────────────────────────────────────────────
    const tagRemoveMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)\/tags\/(.+)$/);
    if (tagRemoveMatch && method === 'DELETE') {
      const id = tagRemoveMatch[1];
      const tag = decodeURIComponent(tagRemoveMatch[2]);
      await removeTag(id, tag);
      invalidateCache();
      send({ ok: true });
      return;
    }

    // ── Toggle favorite ──────────────────────────────────────────
    const favMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)\/favorite$/);
    if (favMatch && method === 'POST') {
      const id = favMatch[1];
      const isFav = await toggleFavorite(id);
      invalidateCache();
      send({ favorite: isFav });
      return;
    }

    // ── Set tier override ────────────────────────────────────────
    const tierMatch = path.match(/^\/api\/sessions\/([a-f0-9-]+)\/tier$/);
    if (tierMatch && method === 'POST') {
      const id = tierMatch[1];
      const body = await readBody(req);
      if (!body.tier || body.tier < 1 || body.tier > 4) {
        return send({ error: 'tier must be 1-4' }, 400);
      }
      await setTierOverride(id, body.tier);
      invalidateCache();
      send({ ok: true });
      return;
    }

    // ── Stats ────────────────────────────────────────────────────
    if (path === '/api/stats' && method === 'GET') {
      const params = parseQuery(req.url);
      const sessions = await getSessions();
      const stats = computeStats(sessions, params.project || null);
      // Add trash/savings data
      const trashItems = await listTrash();
      stats.trashedCount = trashItems.length;
      stats.trashedSize = trashItems.reduce((sum, i) => sum + (i.fileSizeBytes || 0), 0);
      send(stats);
      return;
    }

    // ── Projects ─────────────────────────────────────────────────
    if (path === '/api/projects' && method === 'GET') {
      const sessions = await getSessions();
      const projectMap = {};
      for (const s of sessions) {
        if (!projectMap[s.slug]) {
          projectMap[s.slug] = {
            slug: s.slug,
            path: s.project,
            shortName: s.shortProject,
            sessions: 0,
            size: 0,
            junk: 0,
            real: 0,
            tiers: { 1: 0, 2: 0, 3: 0, 4: 0 },
          };
        }
        projectMap[s.slug].sessions++;
        projectMap[s.slug].size += s.fileSizeBytes;
        if (s.tier >= 1 && s.tier <= 4) projectMap[s.slug].tiers[s.tier]++;
        if (junkLabel(s.junkScore) === 'junk') projectMap[s.slug].junk++;
        else if (junkLabel(s.junkScore) === 'real') projectMap[s.slug].real++;
      }
      const projects = Object.values(projectMap).sort((a, b) => b.sessions - a.sessions);
      send(projects);
      return;
    }

    // ── Search ───────────────────────────────────────────────────
    if (path === '/api/search' && method === 'GET') {
      const params = parseQuery(req.url);
      if (!params.q) return send({ error: 'Missing q parameter' }, 400);
      const sessions = await getSessions();
      const result = filterSessions(sessions, {
        query: params.q,
        project: params.project || null,
        limit: parseInt(params.limit) || 30,
      });
      send(result);
      return;
    }

    // ── Tags list ────────────────────────────────────────────────
    if (path === '/api/tags' && method === 'GET') {
      const tags = await getAllTags();
      send(tags);
      return;
    }

    // ── Trash a session ──────────────────────────────────────────
    const trashMatch = path.match(/^\/api\/trash\/([a-f0-9-]+)$/);
    if (trashMatch && method === 'POST') {
      const id = trashMatch[1];
      const sessions = await getSessions();
      const session = sessions.find(s => s.id === id || s.id.startsWith(id));
      if (!session) return send({ error: 'Not found' }, 404);
      const result = await trashSession(session, 'web');
      invalidateCache();
      await clearCache();
      send(result);
      return;
    }

    // ── Batch trash ──────────────────────────────────────────────
    if (path === '/api/batch/trash' && method === 'POST') {
      const body = await readBody(req);
      if (!body.ids || !Array.isArray(body.ids)) {
        return send({ error: 'Missing ids array' }, 400);
      }
      const sessions = await getSessions();
      let trashed = 0;
      for (const id of body.ids) {
        const session = sessions.find(s => s.id === id);
        if (session) {
          try {
            await trashSession(session, 'batch');
            trashed++;
          } catch { /* skip */ }
        }
      }
      invalidateCache();
      await clearCache();
      send({ trashed, total: body.ids.length });
      return;
    }

    // ── Batch tag ────────────────────────────────────────────────
    if (path === '/api/batch/tag' && method === 'POST') {
      const body = await readBody(req);
      if (!body.ids || !body.tag) {
        return send({ error: 'Missing ids or tag' }, 400);
      }
      await batchSetTag(body.ids, body.tag);
      invalidateCache();
      send({ ok: true, tagged: body.ids.length });
      return;
    }

    // ── Batch delete from trash ──────────────────────────────────
    if (path === '/api/batch/trash-delete' && method === 'POST') {
      const body = await readBody(req);
      if (!body.ids || !Array.isArray(body.ids)) return send({ error: 'Missing ids' }, 400);
      let deleted = 0;
      for (const id of body.ids) {
        try { await deleteFromTrash(id); deleted++; } catch { /* skip */ }
      }
      send({ deleted, total: body.ids.length });
      return;
    }

    // ── Batch restore from trash ─────────────────────────────────
    if (path === '/api/batch/restore' && method === 'POST') {
      const body = await readBody(req);
      if (!body.ids || !Array.isArray(body.ids)) return send({ error: 'Missing ids' }, 400);
      let restored = 0;
      for (const id of body.ids) {
        try { await restoreSession(id); restored++; } catch { /* skip */ }
      }
      invalidateCache();
      await clearCache();
      send({ restored, total: body.ids.length });
      return;
    }

    // ── Restore from trash ───────────────────────────────────────
    const restoreMatch = path.match(/^\/api\/restore\/([a-f0-9-]+)$/);
    if (restoreMatch && method === 'POST') {
      const id = restoreMatch[1];
      const result = await restoreSession(id);
      invalidateCache();
      await clearCache();
      send(result);
      return;
    }

    // ── List trash ───────────────────────────────────────────────
    if (path === '/api/trash' && method === 'GET') {
      const items = await listTrash();
      send(items);
      return;
    }

    // ── Permanently delete from trash ─────────────────────────────
    const deleteTrashMatch = path.match(/^\/api\/trash\/([a-f0-9-]+)$/);
    if (deleteTrashMatch && method === 'DELETE') {
      const id = deleteTrashMatch[1];
      const result = await deleteFromTrash(id);
      send(result);
      return;
    }

    // 404
    send({ error: 'Not found' }, 404);

  } catch (err) {
    console.error('Error:', err);
    send({ error: err.message }, 500);
  }
}

export async function startServer(port = 3456) {
  const server = createServer(handleRequest);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  Port ${port} is already in use. Try: csesh web --port ${port + 1}`);
    } else {
      console.error(`  Server error: ${err.message}`);
    }
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  \u2B21 csesh dashboard`);
    console.log(`  http://localhost:${port}\n`);
    console.log(`  Press Ctrl+C to stop\n`);
  });
  return server;
}
