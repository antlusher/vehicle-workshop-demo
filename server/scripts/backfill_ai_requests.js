require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const { rows: assistantMessages } = await client.query(`
      SELECT
        ph.id,
        ph.project_id,
        ph.text AS answer_text,
        ph.created_at,
        p.user_id,
        (
          SELECT text FROM project_history
          WHERE project_id = ph.project_id
            AND role = 'user'
            AND created_at < ph.created_at
          ORDER BY created_at DESC
          LIMIT 1
        ) AS question_text
      FROM project_history ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.role = 'assistant'
      ORDER BY ph.created_at ASC
    `);

    console.log(`Found ${assistantMessages.length} AI responses in project history`);

    let inserted = 0;
    let skipped = 0;

    for (const msg of assistantMessages) {
      const { rows: existing } = await client.query(
        `SELECT 1 FROM ai_requests
         WHERE project_id = $1
           AND ABS(EXTRACT(EPOCH FROM (created_at - $2::timestamptz))) < 30`,
        [msg.project_id, msg.created_at]
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const questionPreview = msg.question_text
        ? msg.question_text.substring(0, 500)
        : null;
      const answerPreview = msg.answer_text
        ? msg.answer_text.substring(0, 500)
        : null;

      await client.query(
        `INSERT INTO ai_requests
           (user_id, project_id, question_preview, answer_preview, input_tokens, output_tokens, model, duration_ms, created_at)
         VALUES ($1, $2, $3, $4, 0, 0, 'claude-3-5-sonnet (backfilled)', NULL, $5)`,
        [msg.user_id, msg.project_id, questionPreview, answerPreview, msg.created_at]
      );
      inserted++;
    }

    console.log(`Done — inserted: ${inserted}, skipped (already logged): ${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
