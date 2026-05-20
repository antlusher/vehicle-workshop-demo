const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cheerio = require('cheerio');
const { query } = require('../../services/db');
const { extractKnowledgeFromText } = require('../../services/aiService');
const { embedKbEntry, backfillEmbeddings } = require('../../services/embeddingService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router();

router.get('/knowledge-base', async (req, res) => {
  const { category, make, search } = req.query;
  const admin = require('../../services/adminService');
  const entries = await admin.listKnowledgeBase({ category, make, search, workshopId: req.workshopId });
  return res.json(entries);
});

router.post('/knowledge-base', async (req, res) => {
  try {
    const admin = require('../../services/adminService');
    const entry = await admin.createKnowledgeBaseEntry(req.body, req.admin.id, req.workshopId);
    return res.status(201).json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/knowledge-base/:id', async (req, res) => {
  try {
    const admin = require('../../services/adminService');
    const entry = await admin.updateKnowledgeBaseEntry(req.params.id, req.body, req.workshopId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    return res.json(entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/knowledge-base/:id', async (req, res) => {
  const admin = require('../../services/adminService');
  await admin.deleteKnowledgeBaseEntry(req.params.id, req.workshopId);
  return res.json({ deleted: true });
});

router.post('/knowledge/scrape-url', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are supported' });
  }

  let resp;
  try {
    resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutomotiveKnowledgeBot/1.0)' },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    if (!resp.ok) return res.status(400).json({ error: `Page returned ${resp.status}` });
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'Page fetch timed out (20s)' : err.message;
    return res.status(400).json({ error: msg });
  }

  const contentType = resp.headers.get('content-type') || '';
  const isPdf = contentType.includes('application/pdf') || parsed.pathname.toLowerCase().endsWith('.pdf');

  let text = '';
  let pageTitle = parsed.hostname;

  if (isPdf) {
    try {
      const buffer = Buffer.from(await resp.arrayBuffer());
      const { text: pdfText } = await pdfParse(buffer);
      text = pdfText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      pageTitle = parsed.pathname.split('/').pop() || parsed.hostname;
    } catch (err) {
      return res.status(422).json({ error: 'Could not parse PDF from URL: ' + err.message });
    }
  } else {
    const html = await resp.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, header, footer, aside, iframe, [class*="nav"], [class*="menu"], [class*="sidebar"], [class*="cookie"], [class*="banner"], [id*="nav"], [id*="menu"], [id*="sidebar"]').remove();
    pageTitle = $('title').text().trim() || parsed.hostname;
    const CONTENT_SELECTORS = ['article', 'main', '[role="main"]', '.content', '.article-body', '.post-content', '.entry-content', '#content', '#main'];
    for (const sel of CONTENT_SELECTORS) {
      const el = $(sel);
      if (el.length) { text = el.text(); break; }
    }
    if (!text) text = $('body').text();
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (text.length < 150) {
    return res.status(400).json({ error: 'Could not extract meaningful text from this URL — the page may require JavaScript to render or block bots.' });
  }

  const truncated = text.length > 18000 ? text.slice(0, 18000) + '\n[content truncated]' : text;

  try {
    const { entries } = await extractKnowledgeFromText(truncated);
    return res.json({ chunks: entries, pageTitle, url });
  } catch (err) {
    return res.status(500).json({ error: 'AI extraction failed: ' + err.message });
  }
});

router.post('/knowledge/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
  try {
    const { text } = await pdfParse(req.file.buffer);
    const chunks = chunkPdfText(text);
    return res.json({ chunks });
  } catch (err) {
    return res.status(422).json({ error: 'Could not parse PDF: ' + err.message });
  }
});

router.post('/knowledge/import-chunks', async (req, res) => {
  const { chunks } = req.body;
  if (!Array.isArray(chunks) || !chunks.length) {
    return res.status(400).json({ error: 'chunks array is required' });
  }
  const saved = [];
  for (const chunk of chunks) {
    if (!chunk.title?.trim() || !chunk.content?.trim()) continue;
    const { rows } = await query(
      `INSERT INTO knowledge_base
         (category, make, model, year_from, year_to, fault_code, title, content, source, engine_id, transmission_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        chunk.category || 'General',
        chunk.make || null,
        chunk.model || null,
        chunk.year_from || null,
        chunk.year_to || null,
        chunk.fault_code || null,
        chunk.title.trim(),
        chunk.content.trim(),
        chunk.source || null,
        chunk.engine_id || null,
        chunk.transmission_id || null,
        req.admin.id,
      ]
    );
    saved.push(rows[0].id);
    embedKbEntry(rows[0].id, chunk);
  }
  return res.json({ imported: saved.length });
});

router.post('/knowledge/backfill-embeddings', async (req, res) => {
  try {
    const result = await backfillEmbeddings();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function chunkPdfText(text) {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const paragraphs = normalised.split('\n\n').map((p) => p.trim()).filter(Boolean);

  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (/^\d+$/.test(para) || para.length < 40) continue;
    if (buffer.length === 0) {
      buffer = para;
    } else if (buffer.length + para.length < 1200) {
      buffer += '\n\n' + para;
    } else {
      chunks.push(makeChunk(buffer));
      buffer = para;
    }
  }
  if (buffer.length >= 40) chunks.push(makeChunk(buffer));

  return chunks;
}

function makeChunk(text) {
  const lines = text.split('\n');
  const firstLine = lines[0].trim();
  const title = firstLine.length <= 120 ? firstLine : firstLine.slice(0, 117) + '…';
  return { title, content: text, category: 'General', make: '', model: '', year_from: '', year_to: '', fault_code: '', source: '', engine_id: '', transmission_id: '', included: true };
}

module.exports = router;
