const { query } = require('./db');

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMS = 384;

// Lazy-loaded pipeline — downloads model on first use, then cached in memory
let _pipeline = null;
async function getPipeline() {
  if (_pipeline) return _pipeline;
  const { pipeline } = await import('@xenova/transformers');
  _pipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
  return _pipeline;
}

async function generateEmbedding(text) {
  const input = text.slice(0, 4000);
  const pipe = await getPipeline();
  const output = await pipe(input, { pooling: 'mean', normalize: true });
  return Array.from(output.data); // float[]
}

function entryText(entry) {
  return [entry.title, entry.content, entry.make, entry.model, entry.fault_code]
    .filter(Boolean)
    .join(' ');
}

// Generate embedding for a KB entry and store it — fire-and-forget safe
async function embedKbEntry(id, entry) {
  try {
    const vec = await generateEmbedding(entryText(entry));
    await query(
      `UPDATE knowledge_base SET embedding = $1 WHERE id = $2`,
      [`[${vec.join(',')}]`, id]
    );
  } catch (err) {
    console.error(`[embedding] Failed to embed KB entry ${id}:`, err.message);
  }
}

// Backfill all entries missing embeddings — called from admin route
async function backfillEmbeddings() {
  const { rows } = await query(
    `SELECT id, title, content, make, model, fault_code FROM knowledge_base WHERE embedding IS NULL LIMIT 200`
  );

  let count = 0;
  for (const row of rows) {
    await embedKbEntry(row.id, row);
    count++;
  }
  return { embedded: count, remaining: rows.length === 200 };
}

// Cosine similarity search — returns null if pgvector unavailable
async function vectorSearch(questionText, { engineId, workshopId, limit = 6 } = {}) {
  let vec;
  try {
    vec = await generateEmbedding(questionText);
  } catch (err) {
    console.error('[embedding] vectorSearch generate failed:', err.message);
    return null;
  }

  const vecLiteral = `[${vec.join(',')}]`;

  try {
    const { rows } = await query(
      `SELECT title, content, category, fault_code, source,
              1 - (embedding <=> $1::vector) AS similarity,
              CASE WHEN engine_id = $2 THEN 1 ELSE 0 END AS engine_match
       FROM knowledge_base
       WHERE embedding IS NOT NULL
         AND ($3::uuid IS NULL OR workshop_id = $3 OR workshop_id IS NULL)
         AND 1 - (embedding <=> $1::vector) > 0.3
       ORDER BY engine_match DESC, similarity DESC
       LIMIT $4`,
      [vecLiteral, engineId || null, workshopId || null, limit]
    );
    return rows;
  } catch (err) {
    console.error('[embedding] vectorSearch query failed:', err.message);
    return null;
  }
}

module.exports = { generateEmbedding, embedKbEntry, backfillEmbeddings, vectorSearch, EMBEDDING_DIMS };
