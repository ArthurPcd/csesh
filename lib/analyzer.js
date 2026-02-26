/**
 * Claude Sessions Organizer
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/claude-sessions-organizer
 */

/**
 * Deep session analysis — extracts rich metadata from full JSONL records.
 * Tool usage, thinking metrics, files touched, auto-tags, language detection.
 */

const EXTENSION_TAGS = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.rb': 'ruby',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c',
  '.html': 'html', '.css': 'css', '.scss': 'css',
  '.json': 'config', '.yaml': 'config', '.yml': 'config', '.toml': 'config',
  '.md': 'docs', '.mdx': 'docs',
  '.sql': 'database', '.prisma': 'database',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.dockerfile': 'docker', '.docker': 'docker',
  '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
};

const TOOL_TAGS = {
  WebFetch: 'web', WebSearch: 'web',
  Bash: 'cli', Read: 'files', Write: 'files', Edit: 'files',
  Glob: 'files', Grep: 'search',
  NotebookEdit: 'jupyter',
  Task: 'agents',
};

const KEYWORD_TAGS = [
  { pattern: /\b(test|spec|jest|mocha|vitest)\b/i, tag: 'testing' },
  { pattern: /\b(bug|fix|error|issue|debug)\b/i, tag: 'bugfix' },
  { pattern: /\b(refactor|clean|restructur)\b/i, tag: 'refactor' },
  { pattern: /\b(deploy|ci|cd|pipeline|github.actions)\b/i, tag: 'devops' },
  { pattern: /\b(docker|container|kubernetes|k8s)\b/i, tag: 'docker' },
  { pattern: /\b(api|endpoint|route|rest|graphql)\b/i, tag: 'api' },
  { pattern: /\b(database|db|sql|mongo|postgres|redis)\b/i, tag: 'database' },
  { pattern: /\b(auth|login|oauth|jwt|session)\b/i, tag: 'auth' },
  { pattern: /\b(style|css|design|ui|ux|layout|theme)\b/i, tag: 'ui' },
  { pattern: /\b(react|next|vue|svelte|angular)\b/i, tag: 'frontend' },
  { pattern: /\b(node|express|fastify|koa)\b/i, tag: 'backend' },
  { pattern: /\b(git|commit|branch|merge|rebase)\b/i, tag: 'git' },
];

// Simple language detection by checking for common words
const LANG_HINTS = {
  fr: /\b(je|tu|il|nous|vous|les|des|une|est|sont|dans|pour|avec|que|sur|pas|fait|faire|peut|cette|mais|aussi|comme|bien|tout|très|plus|moins|ici|merci|bonjour|salut|oui|non|voici|voilà|ajoute|modifie|supprime|corrige|fais|mets|change|crée|regarde)\b/i,
  es: /\b(el|la|los|las|es|son|en|para|con|que|por|pero|como|bien|todo|más|menos|aquí|gracias|hola|sí|añade|modifica|crea|mira)\b/i,
  de: /\b(der|die|das|ein|eine|ist|sind|in|für|mit|und|aber|wie|gut|alles|mehr|weniger|hier|danke|hallo|ja|nein)\b/i,
};

/**
 * Analyze all records from a session for deep metadata extraction.
 */
export function analyzeRecords(records) {
  const analysis = {
    toolUsage: {},
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
  };

  const fileSet = new Set();
  const tagCounts = new Map();
  let lastRecType = null;
  const responseLengths = [];
  const userTexts = [];

  for (const rec of records) {
    // Sub-agent detection
    if (rec.type === 'progress' && rec.data?.type === 'agent_progress') {
      analysis.hasSubAgents = true;
    }

    // Assistant message analysis
    if (rec.type === 'assistant' && Array.isArray(rec.message?.content)) {
      for (const block of rec.message.content) {
        if (block.type === 'thinking') {
          analysis.thinkingBlocks++;
          analysis.thinkingCharacters += (block.thinking || '').length;
        }
        if (block.type === 'tool_use') {
          const name = block.name || 'unknown';
          analysis.toolUsage[name] = (analysis.toolUsage[name] || 0) + 1;
          analysis.totalToolCalls++;
          extractFilePaths(block, fileSet);

          // Tool-based tags
          if (TOOL_TAGS[name]) {
            incrTag(tagCounts, TOOL_TAGS[name]);
          }
        }
        if (block.type === 'text') {
          responseLengths.push((block.text || '').length);
        }
      }
    }

    // Failed tool calls from tool_result blocks
    if (rec.type === 'user' && Array.isArray(rec.message?.content)) {
      for (const block of rec.message.content) {
        if (block.type === 'tool_result' && block.is_error) {
          analysis.failedToolCalls++;
        }
      }
    }

    // Turn counting (alternating user/assistant pairs)
    if (rec.type === 'user' || rec.type === 'assistant') {
      if (rec.type !== lastRecType) analysis.turnCount++;
      lastRecType = rec.type;
    }

    // Collect user message text (skip tool results)
    if (rec.type === 'user') {
      const text = extractTextFromContent(rec.message?.content);
      if (text) userTexts.push(text);
    }
  }

  // First and last user messages
  analysis.firstUserMessage = userTexts[0] || '';
  analysis.lastUserMessage = userTexts[userTexts.length - 1] || '';

  // Avg response length
  if (responseLengths.length > 0) {
    analysis.avgResponseLength = Math.round(
      responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length
    );
  }

  // Files touched
  analysis.filesTouched = [...fileSet];
  analysis.uniqueFilesCount = fileSet.size;

  // File extension tags
  for (const f of fileSet) {
    const ext = getExtension(f);
    if (ext && EXTENSION_TAGS[ext]) {
      incrTag(tagCounts, EXTENSION_TAGS[ext]);
    }
  }

  // Keyword tags from user messages
  const allUserText = userTexts.join(' ');
  for (const { pattern, tag } of KEYWORD_TAGS) {
    if (pattern.test(allUserText)) {
      incrTag(tagCounts, tag);
    }
  }

  // Top 5 auto-tags by frequency
  analysis.autoTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Language detection
  analysis.language = detectLanguage(allUserText);

  return analysis;
}

function extractFilePaths(toolUseBlock, fileSet) {
  const input = toolUseBlock.input;
  if (!input) return;
  if (input.file_path && typeof input.file_path === 'string') {
    fileSet.add(input.file_path);
  }
  if (input.path && typeof input.path === 'string') {
    fileSet.add(input.path);
  }
}

function extractTextFromContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(b => b.type === 'text')
      .map(b => b.text || '');
    return texts.join('\n').trim();
  }
  return '';
}

function getExtension(filePath) {
  const match = filePath.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : null;
}

function incrTag(map, tag) {
  map.set(tag, (map.get(tag) || 0) + 1);
}

function detectLanguage(text) {
  if (!text || text.length < 20) return 'en';

  // Count matches for each language
  let bestLang = 'en';
  let bestCount = 0;

  for (const [lang, regex] of Object.entries(LANG_HINTS)) {
    const matches = text.match(new RegExp(regex.source, 'gi'));
    const count = matches ? matches.length : 0;
    if (count > bestCount && count >= 3) {
      bestCount = count;
      bestLang = lang;
    }
  }

  return bestLang;
}
