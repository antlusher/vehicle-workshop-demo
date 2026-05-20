const { query } = require('../db');

function buildSystemPrompt(project, crossWorkshopFixes = [], chatMode = 'diagnose', techDocSummary = '') {
  const isHowTo = chatMode === 'howto';
  const isWorkshop = chatMode === 'workshop';

  if (isWorkshop) {
    const meta = project.motVehicleMeta || {};
    const make = project.make || meta.make || '';
    const model = project.model || meta.model || '';
    const year = project.year || (meta.firstUsedDate || meta.manufactureDate
      ? String(new Date(meta.firstUsedDate || meta.manufactureDate).getFullYear()) : '') || '';
    const fuelType = project.fuelType || meta.fuelType || '';
    const engineSize = meta.engineSize ? `${meta.engineSize}cc` : '';

    return [
      'You are a workshop management assistant for a professional vehicle repair workshop.',
      'You have two capabilities: answering analytics questions about the workshop, and performing admin tasks for the current job.',
      '',
      'CURRENT JOB:',
      project.registration ? `Registration: ${project.registration}` : null,
      make ? `Vehicle: ${[year, make, model, project.engineCode, fuelType, engineSize].filter(Boolean).join(' ')}` : null,
      `Project ID: ${project.id}`,
      '',
      'WHAT YOU CAN DO:',
      '1. ANALYTICS — answer questions about the workshop using query_workshop_stats:',
      '   - How many vehicles by make/model have been worked on',
      '   - Job counts by month',
      '   - Customer and staff counts',
      '   - Most common confirmed faults and repairs',
      '   - Service type breakdown (oil/service, brakes, timing, tyres)',
      '   - Revenue from invoiced quotes',
      '   - Active vs closed job counts',
      '',
      '2. QUOTE CREATION — build quotes for the current job:',
      '   - Use search_parts_catalogue FIRST to find stocked parts with real part numbers and cost prices',
      '   - Use get_project_specs to get oil grade, capacity, service intervals',
      '   - Use get_mot_summary to get the latest mileage reading',
      '   - Prefer catalogue parts (real part numbers, known cost). Fall back to estimated prices only if not found.',
      '   - Always show the proposed lines WITH COSTS before creating',
      '   - Ask "Shall I create this quote?" and wait for confirmation',
      '   - Only call create_quote after the technician confirms',
      '',
      'FORMATTING RULES:',
      '- Be concise. For analytics, give a direct answer with the numbers.',
      '- Do not use emojis.',
      '- Do not use markdown tables. Ever.',
      '- For quote proposals, use a simple numbered list. Each line on its own row:',
      '    1. [Part no.] Description — Qty x £price = £total',
      '  Include a plausible generic part number (e.g. OIL-5W30-4L, FIL-OIL-PSA15, etc.).',
      '  End with a blank line then: Subtotal: £x.xx | VAT (20%): £x.xx | Total: £x.xx',
      '- After creating a quote, remind the technician to review it in the Quote tab.',
    ].filter((l) => l !== null).join('\n');
  }

  const lines = [
    'You are an expert automotive assistant for professional vehicle repair technicians.',
    'You have access to a workshop knowledge base and vehicle database via tools.',
    '',
  ];

  const meta = project.motVehicleMeta || {};
  const make = project.make || meta.make;
  const model = project.model || meta.model;
  const year = project.year || (meta.firstUsedDate || meta.manufactureDate
    ? String(new Date(meta.firstUsedDate || meta.manufactureDate).getFullYear()) : null);
  const fuelType = project.fuelType || meta.fuelType;
  const engineCode = project.engineCode;

  lines.push('Current vehicle:');
  if (project.registration) lines.push(`Registration: ${project.registration}`);
  if (project.vin) lines.push(`VIN: ${project.vin}`);
  if (make) lines.push(`Make: ${make}`);
  if (model) lines.push(`Model: ${model}`);
  if (year) lines.push(`Year: ${year}`);
  if (engineCode) lines.push(`Engine code: ${engineCode}`);
  if (fuelType) lines.push(`Fuel type: ${fuelType}`);
  if (meta.engineSize) lines.push(`Engine size: ${meta.engineSize}cc`);
  if (project.bodyType) lines.push(`Body type: ${project.bodyType}`);
  lines.push('');

  // Diesel guard — prevent AI from referencing petrol-only variable valve systems
  const isDiesel = fuelType && /diesel/i.test(fuelType);
  if (isDiesel) {
    lines.push(
      'IMPORTANT: This is a DIESEL engine. Do NOT reference VVT (Variable Valve Timing), VANOS, Valvetronic, i-VTEC, or any petrol-specific variable valve timing systems — these do not exist on diesel engines and must never be mentioned.',
      '',
    );
  }

  if (techDocSummary) {
    lines.push(
      'MANUFACTURER TECHNICAL DOCUMENTATION FOR THIS ENGINE (treat as authoritative — this overrides your training knowledge for this specific engine):',
      '',
      techDocSummary,
      '',
    );
  }

  if (isHowTo) {
    lines.push(
      'MODE: How To / Procedure',
      'The technician needs step-by-step instructions for a specific repair or replacement task.',
      '',
      'CRITICAL: Before writing ANY response, you MUST call search_knowledge_base and web_search — no exceptions.',
      'Step 1: Call search_knowledge_base with the procedure name. If it returns documented steps, use those EXACTLY and verbatim.',
      'Step 2: If asking about duration or time, call web_search for "make model year [job] labour time hours" — you do not have reliable labour time data in training.',
      'Step 3: Only use training knowledge to fill gaps after tools have been called.',
      '',
      '- Respond ONLY with a numbered list of steps. No preamble, no intro, no closing remarks.',
      '- Do NOT ask diagnostic questions or suggest further investigation.',
      '- Do NOT include MOT history, advisories, or condition observations.',
      '- Assume the technician has already decided to do this job.',
      '- Include torque values, special tools, and critical warnings inline with the relevant step.',
      '- Keep each step concise — one action per step.',
    );
  } else {
    lines.push(
      'MODE: Diagnose',
      '',
      'CRITICAL — YOUR KNOWLEDGE LIMITATIONS:',
      'Your training data for labour times, job durations, and cost estimates is NOT reliable for specific vehicles. You must treat these as unknown until looked up. If a technician asks how long a job takes, what a job should cost, or any time/cost figure — you do not know the answer from training and MUST call web_search before responding. Giving a figure from training data without searching is a hallucination.',
      '',
      'MANDATORY TOOL USE — you must call tools in these situations, no exceptions:',
      '1. Any question about job duration, labour time, or how long something takes → call web_search immediately with make, model, year and job name.',
      '2. Any question about cost, price, or parts pricing → call web_search.',
      '3. Any question about torque specs, fluid capacities, or clearances → call web_search.',
      '4. Any question about recalls, TSBs, or known issues → call web_search.',
      '5. Every response → call search_knowledge_base to check confirmed fixes first.',
      '6. DTC codes → call get_dtc_info.',
      '',
      'STRICT formatting rules — follow these exactly:',
      '- Do NOT use emojis anywhere in your response.',
      '- Safety warnings (do not start engine, do not drive, risk of injury, etc.) must start with "Do not" or "Warning:" so they are visually distinct.',
      '- When listing actions for the technician to carry out, introduce them with a plain heading such as "Actions to try:" or "Next steps:" so they are clearly grouped.',
      '- Do NOT front-load multiple diagnostic branches in one response. Ask your initial questions first, then wait for the technician\'s answers before providing the next steps.',
      '- When asking diagnostic questions, write ONE question per bullet point. Never combine two questions into one bullet using "or". Split them.',
      '- Every yes/no diagnostic question MUST end with a question mark (?).',
      '- Yes/no questions must be strictly binary — do NOT offer multiple options or alternative conditions in a single bullet. Any bullet containing " or " that presents two distinct states or conditions (e.g. "at all RPMs or only at low idle", "constant or intermittent", "low, overfull, or normal") must be rewritten as a What/Which question so the technician can type their answer.',
      '- Never add a follow-up to a yes/no question in the same bullet. Wrong: "Are there DTCs stored? If yes, what are the codes?" — instead write two separate bullets: one yes/no question, then one What/Which question on the next bullet.',
      '- Open-ended questions that require a descriptive answer (starting with Which, What, How, Describe, List) must also end with a question mark (?).',
      '- Suggested actions and fixes must NOT end with a question mark.',
      '- Do NOT repeat questions at the bottom of the response that you already asked at the top.',
      '- Keep each bullet point concise — one idea only.',
      '- Use plain section headings without icons or symbols.',
    );

    if (project.motVehicleMeta) {
      const m = project.motVehicleMeta;
      const metaFields = [
        m.make && `Make: ${m.make}`,
        m.model && `Model: ${m.model}`,
        m.fuelType && `Fuel: ${m.fuelType}`,
        m.engineSize && `Engine: ${m.engineSize}cc`,
        m.primaryColour && `Colour: ${m.primaryColour}`,
        m.firstUsedDate && `First used: ${m.firstUsedDate.slice(0, 10)}`,
      ].filter(Boolean);
      if (metaFields.length) {
        lines.push('', 'DVSA vehicle data:');
        metaFields.forEach((f) => lines.push(f));
      }
    }

    if (project.motTests && project.motTests.length > 0) {
      const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      lines.push('', `MOT history (${project.motTests.length} tests, most recent first):`);
      project.motTests.forEach((t) => {
        const date = fmtDate(t.testDate);
        const miles = t.odometerValue != null && t.odometerResultType === 'READ'
          ? `${t.odometerValue.toLocaleString()} mi` : '';
        const defects = (t.defects || []).map((d) => `${d.type}: ${d.text}`).join('; ');
        lines.push(`- ${date} | ${t.result}${miles ? ' | ' + miles : ''}${defects ? ' | ' + defects : ''}`);
      });

      const allDefects = project.motTests.flatMap((t) => t.defects || []);
      const defectCounts = {};
      allDefects.forEach((d) => {
        const key = d.text.slice(0, 60).toLowerCase();
        defectCounts[key] = (defectCounts[key] || 0) + 1;
      });
      const recurring = Object.entries(defectCounts)
        .filter(([, count]) => count >= 2)
        .map(([text]) => text);
      if (recurring.length) {
        lines.push('', 'Recurring MOT advisories (appearing 2+ times):');
        recurring.forEach((r) => lines.push(`- ${r}`));
        lines.push('Consider these as known ongoing issues when diagnosing.');
      }
    }

    if (crossWorkshopFixes.length > 0) {
      lines.push('', 'Confirmed repairs on this vehicle from other workshops:');
      crossWorkshopFixes.forEach((fix) => {
        const date = new Date(fix.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        lines.push(`- ${fix.text} (confirmed ${date})`);
      });
      lines.push('', 'Use this history to: avoid re-diagnosing already-confirmed fixes, identify recurring faults, and understand what has already been attempted. If a previous fix matches the current symptom, investigate whether the repair failed, was incomplete, or if a related fault has developed.');
    }
  }

  return lines.join('\n');
}

function buildMessages(history, question) {
  const messages = history.slice(-10).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.text,
  }));
  messages.push({ role: 'user', content: question });
  return messages;
}

async function fetchEngineDocSummary(engineCode, question = '', project = null) {
  try {
    const { vectorSearch } = require('../embeddingService');
    let engineId = null;

    if (engineCode) {
      const { rows: eRows } = await query(
        'SELECT id FROM engines WHERE LOWER(code) = LOWER($1)',
        [engineCode]
      );
      if (eRows.length) engineId = eRows[0].id;
    }

    if (question) {
      const vecDocs = await vectorSearch(question, { engineId, limit: 5 });
      if (vecDocs && vecDocs.length > 0) {
        return { summary: vecDocs.map((r) => r.content).join('\n\n---\n\n'), chunks: vecDocs };
      }
    }

    const make = project?.make || null;
    const model = project?.model || null;
    const ftsQuery = question || null;

    const { rows: docRows } = await query(
      `SELECT id, title, content, source FROM knowledge_base
       WHERE (
         ($1::uuid IS NOT NULL AND engine_id = $1)
         OR ($2::text IS NOT NULL AND $3::text IS NOT NULL
             AND LOWER(make) = LOWER($2) AND LOWER(model) = LOWER($3))
         OR ($4::text IS NOT NULL AND search_vector @@ plainto_tsquery('english', $4))
       )
       ORDER BY
         CASE WHEN $1::uuid IS NOT NULL AND engine_id = $1 THEN 0 ELSE 1 END,
         CASE WHEN $4::text IS NOT NULL AND search_vector IS NOT NULL
              THEN ts_rank(search_vector, plainto_tsquery('english', $4)) ELSE 0 END DESC,
         updated_at DESC
       LIMIT 6`,
      [engineId, make, model, ftsQuery]
    );
    if (!docRows.length) return { summary: '', chunks: [] };
    return { summary: docRows.map((r) => r.content).join('\n\n---\n\n'), chunks: docRows };
  } catch {
    return { summary: '', chunks: [] };
  }
}

module.exports = { buildSystemPrompt, buildMessages, fetchEngineDocSummary };
