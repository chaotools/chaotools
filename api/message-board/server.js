const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3456;
const DATA_FILE = path.join(__dirname, 'messages.json');

app.disable('x-powered-by');
app.set('trust proxy', true);

// Rate limiting: max 5 requests per IP per 10 seconds
const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW = 10000;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function createRateLimit(limit, windowMs) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, reset: now + windowMs };

    if (now > entry.reset) {
      entry.count = 1;
      entry.reset = now + windowMs;
    } else {
      entry.count++;
    }
    rateLimitMap.set(ip, entry);

    if (entry.count > limit) {
      return res.status(429).json({ success: false, error: '请求过于频繁，请稍后重试' });
    }
    next();
  };
}

const rateLimit = createRateLimit(RATE_LIMIT, RATE_WINDOW);
const syncSaveRateLimit = createRateLimit(10, 60000);
const syncLoadRateLimit = createRateLimit(30, 60000);
const counterRateLimit = createRateLimit(30, 60000);

/*
// 原限流实现（保留注释供对照）
function rateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + RATE_WINDOW };

  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now + RATE_WINDOW;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ success: false, error: '请求过于频繁，请稍后重试' });
  }
  next();
}
*/

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.reset) rateLimitMap.delete(ip);
  }
}, 60000);

app.use(express.json({ limit: '600kb' }));

// CORS restricted to chaotools.tech
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://chaotools.tech',
    'https://www.chaotools.tech',
    'http://localhost',
    'http://localhost:5173',
  ];
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function loadMessages() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Load error:', e.message);
  }
  return [];
}

function saveMessages(messages) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf-8');
}

// Sanitize input: strip HTML tags, trim, enforce length
const MAX_NAME = 30;
const MAX_CONTENT = 500;

function sanitize(str) {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// GET /messages
app.get('/messages', rateLimit, (req, res) => {
  const messages = loadMessages();
  res.json({ success: true, data: messages });
});

// POST /messages
app.post('/messages', rateLimit, (req, res) => {
  const { name, content } = req.body;

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, error: '留言内容不能为空' });
  }

  const sanitizedContent = sanitize(content);
  if (sanitizedContent.length === 0) {
    return res.status(400).json({ success: false, error: '留言内容无效' });
  }
  if (sanitizedContent.length > MAX_CONTENT) {
    return res.status(400).json({ success: false, error: `留言不能超过${MAX_CONTENT}字` });
  }

  const rawName = typeof name === 'string' ? name : '';
  const sanitizedName = sanitize(rawName).slice(0, MAX_NAME);
  const displayName = sanitizedName || '匿名';

  const messages = loadMessages();

  // Keep max 500 messages, auto-clean old ones
  if (messages.length >= 500) {
    messages.splice(400);
  }

  const newMsg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: displayName,
    content: sanitizedContent,
    createdAt: new Date().toISOString(),
  };
  messages.unshift(newMsg);
  saveMessages(messages);
  res.json({ success: true, data: newMsg });
});

// ──────────────────────────────────────────────
// SRT Translation endpoint
// ──────────────────────────────────────────────

// Parse SRT into blocks: [{index, start, end, text}]
function parseSRT(srtContent) {
  const blocks = [];
  const lines = srtContent.trim().split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const indexLine = lines[i++].trim();
    if (!indexLine || !/^\d+$/.test(indexLine)) continue;
    const timeLine = (lines[i++] || '').trim();
    const timeMatch = timeLine.match(/^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) { i--; continue; }
    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i++].trim());
    }
    while (i < lines.length && lines[i].trim() === '') i++;
    blocks.push({
      index: parseInt(indexLine),
      start: timeMatch[1].replace(',', '.'),
      end: timeMatch[2].replace(',', '.'),
      text: textLines.join('\n'),
    });
  }
  return blocks;
}

// Rebuild SRT string from blocks
function buildSRT(blocks) {
  let srt = '';
  for (const b of blocks) {
    srt += `${b.index}\n`;
    srt += `${b.start.replace('.', ',')} --> ${b.end.replace('.', ',')}\n`;
    srt += `${b.text}\n\n`;
  }
  return srt.trim() + '\n';
}

// Translate using DeepSeek API with context window
async function translateBlocks(blocks, source, target) {
  if (blocks.length === 0) return blocks;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const langNames = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean' };
  const sourceName = langNames[source] || source;
  const targetName = langNames[target] || target;

  const CHUNK_SIZE = 15; // translate 15 subtitles at a time for context

  for (let start = 0; start < blocks.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, blocks.length);
    const chunk = blocks.slice(start, end);

    // Build a numbered list of source texts
    const textList = chunk.map((b, idx) => `[${start + idx + 1}] ${b.text}`).join('\n');

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: `You are a professional subtitle translator. Translate each line from ${sourceName} to ${targetName}.

RULES:
1. Each line starts with a number in brackets like [1], [2], etc. Keep these markers exactly as-is.
2. Translate ONLY the text after the marker. Do not add explanations.
3. Preserve any formatting tags like <b>, <i>, <u>, <font>.
4. Keep translations concise — subtitles must fit on screen briefly.
5. Output one translated line per input line, with the same [N] marker.
6. If the source text is already in ${targetName} or is a number/symbol, copy it as-is.
7. Output ONLY the translated lines, nothing else.`
          },
          { role: 'user', content: textList }
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content || '';
    const translatedLines = translatedText.split('\n').filter(l => l.trim());

    // Parse translated lines back to blocks
    for (const line of translatedLines) {
      const match = line.match(/^\[(\d+)\]\s*(.*)$/);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        if (idx >= start && idx < end) {
          blocks[idx].original = blocks[idx].text;
          blocks[idx].text = blocks[idx].text + '\n' + match[2].trim();
        }
      }
    }
  }

  return blocks;
}

app.post('/translate', rateLimit, async (req, res) => {
  const { srt, source, target } = req.body;

  if (typeof srt !== 'string' || !srt.trim()) {
    return res.status(400).json({ success: false, error: 'SRT 内容不能为空' });
  }
  if (srt.length > 500000) {
    return res.status(400).json({ success: false, error: 'SRT 文件过大（最大 500KB）' });
  }

  try {
    const blocks = parseSRT(srt);
    if (blocks.length === 0) {
      return res.status(400).json({ success: false, error: '无法解析 SRT 文件，请检查格式' });
    }
    if (blocks.length > 500) {
      return res.status(400).json({ success: false, error: `字幕条数过多（${blocks.length}条，最多500条）` });
    }

    const src = (source || 'zh').slice(0, 5);
    const tgt = (target || 'en').slice(0, 5);

    const translated = await translateBlocks(blocks, src, tgt);
    const outputSRT = buildSRT(translated);

    // Count translated vs total
    const translatedCount = translated.filter(b => b.original).length;

    res.json({
      success: true,
      data: {
        srt: outputSRT,
        total: blocks.length,
        translated: translatedCount,
      },
    });
  } catch (err) {
    console.error('Translate error:', err.message);
    res.status(500).json({
      success: false,
      error: `翻译失败: ${err.message}`,
    });
  }
});

// ──────────────────────────────────────────────
// SRT Replace Rules Sync API
// ──────────────────────────────────────────────
const RULES_DIR = '/var/lib/srt-rules';

function ensureRulesDir() {
  if (!fs.existsSync(RULES_DIR)) {
    fs.mkdirSync(RULES_DIR, { recursive: true });
  }
}

function rulesFilePath(code) {
  // Sanitize code: only alphanumeric, dash, underscore, 8-30 chars
  const safe = code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  if (safe.length < 8) return null;
  return path.join(RULES_DIR, safe + '.json');
}

// POST /sync-rules/save  { code, rules }
app.post('/sync-rules/save', syncSaveRateLimit, (req, res) => {
  const { code, rules } = req.body;
  if (typeof code !== 'string' || code.length < 8) {
    return res.status(400).json({ success: false, error: '同步码至少8个字符' });
  }
  if (!Array.isArray(rules)) {
    return res.status(400).json({ success: false, error: 'rules 必须是数组' });
  }
  if (rules.length > 1000) {
    return res.status(400).json({ success: false, error: '规则最多1000条' });
  }

  ensureRulesDir();
  const fp = rulesFilePath(code);
  if (!fp) return res.status(400).json({ success: false, error: '同步码格式无效' });

  const cleaned = rules.map(r => ({
    from: String(r.from || '').slice(0, 200),
    to: String(r.to || '').slice(0, 200),
  }));

  fs.writeFileSync(fp, JSON.stringify(cleaned, null, 2), 'utf-8');
  res.json({ success: true, count: cleaned.length });
});

// GET /sync-rules/load?code=xxx
app.get('/sync-rules/load', syncLoadRateLimit, (req, res) => {
  const code = req.query.code || '';
  if (code.length < 8) {
    return res.status(400).json({ success: false, error: '同步码至少8个字符' });
  }

  ensureRulesDir();
  const fp = rulesFilePath(code);
  if (!fp || !fs.existsSync(fp)) {
    return res.json({ success: true, rules: [], empty: true });
  }

  try {
    const rules = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    res.json({ success: true, rules });
  } catch (e) {
    res.status(500).json({ success: false, error: '读取失败' });
  }
});

// ──────────────────────────────────────────────
// Tool visit counter & popular ranking
// ──────────────────────────────────────────────
const STATS_DIR = '/var/lib/tool-stats';
const STATS_FILE = path.join(STATS_DIR, 'stats.json');

function ensureStatsDir() {
  if (!fs.existsSync(STATS_DIR)) {
    fs.mkdirSync(STATS_DIR, { recursive: true });
  }
}

function loadStats() {
  ensureStatsDir();
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveStats(stats) {
  ensureStatsDir();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
}

// POST /counter/:toolId — increment visit count
app.post('/counter/:toolId', counterRateLimit, (req, res) => {
  const toolId = (req.params.toolId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
  if (!toolId) return res.status(400).json({ success: false, error: 'invalid toolId' });

  const stats = loadStats();
  const today = new Date().toISOString().slice(0, 10);

  if (!stats[toolId]) {
    stats[toolId] = { total: 0, today: 0, date: today };
  }
  // Reset today counter if date changed
  if (stats[toolId].date !== today) {
    stats[toolId].today = 0;
    stats[toolId].date = today;
  }

  stats[toolId].total++;
  stats[toolId].today++;
  saveStats(stats);

  res.json({ success: true, total: stats[toolId].total, today: stats[toolId].today });
});

// GET /stats/popular — return top N tools
app.get('/stats/popular', rateLimit, (req, res) => {
  const n = Math.min(req.query.n || 8, 20);
  const stats = loadStats();
  const today = new Date().toISOString().slice(0, 10);

  const list = Object.entries(stats)
    .map(([id, s]) => ({
      id,
      total: s.total || 0,
      today: s.date === today ? (s.today || 0) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);

  res.json({ success: true, data: list, updated: today });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Message board API running on port ${PORT}`);
});
