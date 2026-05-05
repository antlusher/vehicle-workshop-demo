const { query } = require('./db');

async function getDashboardStats() {
  const [users, projects, aiRequests, tokens] = await Promise.all([
    query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE subscribed) ::int AS subscribed,
      COUNT(*) FILTER (WHERE session_active) ::int AS active_now,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') ::int AS new_this_week
      FROM users`),
    query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE closed) ::int AS closed,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') ::int AS new_this_week
      FROM projects`),
    query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') ::int AS this_week
      FROM ai_requests`),
    query(`SELECT
      COALESCE(SUM(input_tokens + output_tokens), 0)::int AS total_tokens,
      COALESCE(SUM(input_tokens + output_tokens) FILTER (WHERE created_at > now() - interval '30 days'), 0)::int AS tokens_30d
      FROM ai_requests`),
  ]);

  return {
    users: users.rows[0],
    projects: projects.rows[0],
    aiRequests: aiRequests.rows[0],
    tokens: tokens.rows[0],
  };
}

async function listUsers({ limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT
      u.id, u.email, u.role, u.subscribed, u.session_active, u.created_at,
      (SELECT MAX(created_at) FROM login_history WHERE user_id = u.id) AS last_login,
      (SELECT COUNT(*)::int FROM projects WHERE user_id = u.id) AS project_count,
      (SELECT COUNT(*)::int FROM ai_requests WHERE user_id = u.id) AS ai_request_count
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getUser(userId) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.role, u.subscribed, u.session_active, u.created_at FROM users u WHERE u.id = $1`,
    [userId]
  );
  if (!rows.length) return null;

  const [logins, aiStats, projects] = await Promise.all([
    query(
      `SELECT ip_address, user_agent, created_at FROM login_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    ),
    query(
      `SELECT
        COUNT(*)::int AS total_requests,
        COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
        COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms
       FROM ai_requests WHERE user_id = $1`,
      [userId]
    ),
    query(
      `SELECT id, registration, vin, make, model, year, source, active, closed, created_at FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    ),
  ]);

  return {
    ...rows[0],
    loginHistory: logins.rows,
    aiStats: aiStats.rows[0],
    projects: projects.rows,
  };
}

async function updateUser(userId, { role, subscribed }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
  if (subscribed !== undefined) { fields.push(`subscribed = $${idx++}`); values.push(subscribed); }
  if (!fields.length) throw new Error('Nothing to update');

  values.push(userId);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, role, subscribed`,
    values
  );
  return rows[0] || null;
}

async function listAiRequests({ limit = 100, offset = 0, userId } = {}) {
  const conditions = userId ? 'WHERE r.user_id = $3' : '';
  const params = userId ? [limit, offset, userId] : [limit, offset];

  const { rows } = await query(
    `SELECT
      r.id, r.user_id, u.email, r.project_id,
      p.registration, p.make, p.model,
      r.question_preview, r.answer_preview,
      r.input_tokens, r.output_tokens, r.model, r.duration_ms, r.created_at
     FROM ai_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN projects p ON p.id = r.project_id
     ${conditions}
     ORDER BY r.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  return rows;
}

async function getAiStats() {
  const { rows } = await query(
    `SELECT
      DATE_TRUNC('day', created_at) AS day,
      COUNT(*)::int AS requests,
      COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
      COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms
     FROM ai_requests
     WHERE created_at > now() - interval '30 days'
     GROUP BY day
     ORDER BY day DESC`
  );
  return rows;
}

async function listKnowledgeBase({ category, make, search } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (category) { conditions.push(`category = $${idx++}`); values.push(category); }
  if (make) { conditions.push(`LOWER(make) = LOWER($${idx++})`); values.push(make); }
  if (search) {
    conditions.push(`(title ILIKE $${idx} OR content ILIKE $${idx} OR fault_code ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT kb.*, u.email AS created_by_email
     FROM knowledge_base kb
     LEFT JOIN users u ON u.id = kb.created_by
     ${where}
     ORDER BY kb.updated_at DESC`,
    values
  );
  return rows;
}

async function createKnowledgeBaseEntry(data, adminId) {
  const { category, make, model, year_from, year_to, fault_code, title, content, source } = data;
  const { rows } = await query(
    `INSERT INTO knowledge_base (category, make, model, year_from, year_to, fault_code, title, content, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [category, make || null, model || null, year_from || null, year_to || null,
     fault_code || null, title, content, source || null, adminId]
  );
  return rows[0];
}

async function updateKnowledgeBaseEntry(id, data) {
  const { category, make, model, year_from, year_to, fault_code, title, content, source } = data;
  const { rows } = await query(
    `UPDATE knowledge_base
     SET category=$1, make=$2, model=$3, year_from=$4, year_to=$5,
         fault_code=$6, title=$7, content=$8, source=$9, updated_at=now()
     WHERE id=$10 RETURNING *`,
    [category, make || null, model || null, year_from || null, year_to || null,
     fault_code || null, title, content, source || null, id]
  );
  return rows[0] || null;
}

async function deleteKnowledgeBaseEntry(id) {
  await query('DELETE FROM knowledge_base WHERE id = $1', [id]);
}

async function getLearningStats() {
  const [kbTotal, kbByCategory, confirmedStats, topFixes, recentKb] = await Promise.all([
    query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS added_this_week
      FROM knowledge_base`),
    query(`SELECT category, COUNT(*)::int AS count FROM knowledge_base GROUP BY category ORDER BY count DESC`),
    query(`SELECT
      COUNT(*)::int AS total,
      COUNT(DISTINCT project_id)::int AS unique_vehicles
      FROM confirmed_suggestions`),
    query(`SELECT cs.text, COUNT(*)::int AS count, p.make, p.model
      FROM confirmed_suggestions cs
      JOIN projects p ON cs.project_id = p.id
      GROUP BY cs.text, p.make, p.model
      ORDER BY count DESC
      LIMIT 5`),
    query(`SELECT title, category, created_at FROM knowledge_base ORDER BY created_at DESC LIMIT 5`),
  ]);

  return {
    kb: { ...kbTotal.rows[0], byCategory: kbByCategory.rows },
    confirmedFixes: confirmedStats.rows[0],
    topFixes: topFixes.rows,
    recentKb: recentKb.rows,
  };
}

async function getProjectConversation(projectId) {
  const [proj, hist] = await Promise.all([
    query(
      `SELECT p.*, u.email AS user_email
       FROM projects p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [projectId]
    ),
    query(
      'SELECT id, role, text, confirmed, created_at FROM project_history WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId]
    ),
  ]);
  if (!proj.rows.length) return null;
  return { project: proj.rows[0], history: hist.rows };
}

module.exports = {
  getDashboardStats,
  listUsers,
  getUser,
  updateUser,
  listAiRequests,
  getAiStats,
  getLearningStats,
  getProjectConversation,
  listKnowledgeBase,
  createKnowledgeBaseEntry,
  updateKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
};
