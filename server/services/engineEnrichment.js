const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('./db');

const MODEL = 'claude-sonnet-4-6';

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

async function getOrCreateEngine(code, enriched) {
  const existing = await query('SELECT id FROM engines WHERE LOWER(code) = LOWER($1)', [code]);
  if (existing.rows.length) {
    await query(
      `UPDATE engines SET name=COALESCE($2,name), fuel_type=COALESCE($3,fuel_type),
       displacement=COALESCE($4,displacement), aspiration=COALESCE($5,aspiration),
       known_makes=COALESCE($6,known_makes), enriched_at=now(), enriched_model=$7,
       updated_at=now() WHERE id=$1`,
      [existing.rows[0].id, enriched.full_name || null, enriched.fuel_type || null,
       enriched.displacement || null, enriched.aspiration || null,
       enriched.known_vehicles?.length ? enriched.known_vehicles : null, MODEL]
    );
    return existing.rows[0].id;
  }
  const { rows } = await query(
    `INSERT INTO engines (code, name, fuel_type, displacement, aspiration, known_makes, enriched_at, enriched_model)
     VALUES ($1,$2,$3,$4,$5,$6,now(),$7) RETURNING id`,
    [code.toUpperCase(), enriched.full_name || null, enriched.fuel_type || null,
     enriched.displacement || null, enriched.aspiration || null,
     enriched.known_vehicles?.length ? enriched.known_vehicles : null, MODEL]
  );
  return rows[0].id;
}

async function hasExistingKnowledge(engineId) {
  const { rows } = await query(
    `SELECT id FROM knowledge_base WHERE engine_id=$1 AND source='claude-enrichment' LIMIT 1`,
    [engineId]
  );
  return rows.length > 0;
}

async function clearExistingKnowledge(engineId) {
  await query(
    `DELETE FROM knowledge_base WHERE engine_id=$1 AND source='claude-enrichment'`,
    [engineId]
  );
}

async function callClaude(engineCode, make) {
  const context = make ? `${make} ${engineCode}` : engineCode;
  const prompt = `You are an expert automotive engineer with deep knowledge of UK market vehicles.

Provide technical knowledge about the engine code: ${context}

Return ONLY valid JSON — no markdown, no extra text — matching this exact structure:
{
  "full_name": "e.g. Renault Energy dCi 1.6",
  "fuel_type": "Diesel|Petrol|Hybrid",
  "displacement": "e.g. 1598cc",
  "aspiration": "Naturally Aspirated|Turbocharged|Twin Turbocharged|Supercharged",
  "known_vehicles": ["list of make/model combinations using this engine"],
  "overview": "2-3 sentence technical overview of this engine for a workshop technician",
  "common_issues": [
    {
      "title": "Short issue name",
      "severity": "low|medium|high",
      "symptoms": "What the technician will observe",
      "diagnosis": "How to confirm the fault",
      "fix": "Recommended repair action"
    }
  ],
  "maintenance_tips": "Key maintenance notes, oil spec, service intervals, common gotchas"
}

Include 3-8 common issues ordered by frequency/severity. Use empty string for anything you are not confident about.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned no JSON');
  return JSON.parse(match[0]);
}

async function storeKnowledge(engineId, engineCode, enriched) {
  await query(
    `INSERT INTO knowledge_base (engine_id, make, title, content, category, source)
     VALUES ($1, $2, $3, $4, 'engine-profile', $5)`,
    [engineId, engineCode.toUpperCase(),
     `${engineCode.toUpperCase()} Engine Profile`,
     `${enriched.overview || ''}\n\nVehicles: ${(enriched.known_vehicles || []).join(', ')}\nMaintenance: ${enriched.maintenance_tips || ''}`,
     'claude-enrichment']
  );

  for (const issue of enriched.common_issues || []) {
    if (!issue.title) continue;
    const content = [
      issue.symptoms && `Symptoms: ${issue.symptoms}`,
      issue.diagnosis && `Diagnosis: ${issue.diagnosis}`,
      issue.fix && `Fix: ${issue.fix}`,
    ].filter(Boolean).join('\n');

    await query(
      `INSERT INTO knowledge_base (engine_id, make, title, content, category, source)
       VALUES ($1, $2, $3, $4, 'engine-issue', $5)`,
      [engineId, engineCode.toUpperCase(),
       `${engineCode.toUpperCase()}: ${issue.title}`,
       content, 'claude-enrichment']
    );
  }
}

// force=true clears existing Claude KB entries and re-enriches from scratch
async function enrichEngineCode(engineCode, make, { force = false } = {}) {
  if (!client || !engineCode) return;
  const code = engineCode.trim().toUpperCase();

  try {
    // In normal (non-force) mode, skip if we already have knowledge
    if (!force) {
      const engineRow = await query('SELECT id FROM engines WHERE LOWER(code) = LOWER($1)', [code]);
      if (engineRow.rows.length && await hasExistingKnowledge(engineRow.rows[0].id)) return;
    }

    const enriched = await callClaude(code, make);
    const engineId = await getOrCreateEngine(code, enriched);

    if (force) await clearExistingKnowledge(engineId);
    await storeKnowledge(engineId, code, enriched);

    const issueCount = (enriched.common_issues || []).length;
    const tag = force ? '[force]' : '';
    console.log(`[engine-enrichment] ${code} enriched ${tag}— ${issueCount} issues stored`);
  } catch (err) {
    console.error(`[engine-enrichment] ${code} failed: ${err.message}`);
  }
}

module.exports = { enrichEngineCode };
