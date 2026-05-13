const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('./db');
const { toolDefinitions, toolHandlers } = require('./agentTools');
const { workshopToolDefinitions, workshopToolHandlers } = require('./workshopTools');

function createClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const client = createClient();

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

  // Vehicle identity — always included so procedures are vehicle-specific
  // Fall back to DVLA motVehicleMeta when project fields are missing
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

  // Inject manufacturer tech docs as authoritative grounding
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
      '- Respond ONLY with a numbered list of steps. No preamble, no intro, no closing remarks.',
      '- Do NOT ask diagnostic questions or suggest further investigation.',
      '- Do NOT include MOT history, advisories, or condition observations.',
      '- Assume the technician has already decided to do this job.',
      '- Include torque values, special tools, and critical warnings inline with the relevant step.',
      '- Keep each step concise — one action per step.',
      '- Use your tools to look up vehicle-specific specs (torque, fluid capacity, etc.) if needed.',
    );
  } else {
    lines.push(
      'MODE: Diagnose',
      'Always use your tools to check for confirmed fixes and vehicle specs before answering.',
      'If a DTC code is mentioned, use the get_dtc_info tool.',
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

    // DVSA vehicle meta
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

    // MOT history
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

    // Cross-workshop confirmed fixes
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

async function fetchEngineDocSummary(engineCode) {
  if (!engineCode) return '';
  try {
    const { rows: eRows } = await query(
      'SELECT id FROM engines WHERE LOWER(code) = LOWER($1)',
      [engineCode]
    );
    if (!eRows.length) return '';
    const { rows: docRows } = await query(
      `SELECT content FROM knowledge_base
       WHERE engine_id = $1 AND source = 'tech_doc' AND category = 'procedure'
       ORDER BY title LIMIT 8`,
      [eRows[0].id]
    );
    if (!docRows.length) return '';
    return docRows.map((r) => r.content).join('\n\n---\n\n');
  } catch {
    return '';
  }
}

async function runAgentLoop(client, project, history, question, crossWorkshopFixes = [], chatMode = 'diagnose') {
  const techDocSummary = chatMode !== 'workshop'
    ? await fetchEngineDocSummary(project.engineCode)
    : '';
  const messages = buildMessages(history, question);
  const systemPrompt = buildSystemPrompt(project, crossWorkshopFixes, chatMode, techDocSummary);

  const isWorkshop = chatMode === 'workshop';
  const tools = isWorkshop
    ? workshopToolDefinitions
    : chatMode === 'howto'
      ? toolDefinitions.filter((t) => t.name === 'get_vehicle_specs')
      : toolDefinitions;
  const handlers = isWorkshop ? workshopToolHandlers : toolHandlers;

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const handler = handlers[toolUse.name];
      let result;
      try {
        result = handler ? await handler(toolUse.input) : { error: `Unknown tool: ${toolUse.name}` };
      } catch (err) {
        result = { error: err.message };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    answer: textBlock?.text || 'No response generated.',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

function demoFallback(project, question) {
  return [
    'Demo fallback (ANTHROPIC_API_KEY not configured):',
    '',
    `Vehicle: ${project.make || 'Unknown'} ${project.model || ''} ${project.year || ''}`,
    `Question: ${question}`,
    '',
    '- Check relevant fault codes with a diagnostic tool',
    '- Inspect ignition system: plugs, coils, wiring',
    '- Verify fuel pressure and injector operation',
    '- Review service history for related issues',
  ].join('\n');
}

async function generateRepairAdvice(project, history = [], question, crossWorkshopFixes = [], chatMode = 'diagnose') {
  if (!client) {
    return { answer: demoFallback(project, question), inputTokens: 0, outputTokens: 0 };
  }
  return runAgentLoop(client, project, history, question, crossWorkshopFixes, chatMode);
}

async function generateVehicleSpecs(project) {
  if (!client) return null;

  const vehicle = [project.year, project.make, project.model, project.engineCode, project.fuelType, project.trim,
    project.engineSize ? `${project.engineSize}cc` : null]
    .filter(Boolean).join(' ');

  // Fetch tech_doc entries from the knowledge base for this engine — use as authoritative grounding
  let techDocSection = '';
  if (project.engineCode) {
    try {
      const { rows: engineRows } = await query(
        'SELECT id FROM engines WHERE LOWER(code) = LOWER($1)',
        [project.engineCode]
      );
      if (engineRows.length) {
        const { rows: docRows } = await query(
          `SELECT content FROM knowledge_base
           WHERE engine_id = $1 AND source = 'tech_doc'
           ORDER BY title LIMIT 12`,
          [engineRows[0].id]
        );
        if (docRows.length) {
          techDocSection = '\n\nAUTHORITATIVE MANUFACTURER TECH DOCUMENT DATA (treat this as ground truth — it overrides your training knowledge for this engine):\n\n' +
            docRows.map((r) => r.content).join('\n\n---\n\n');
        }
      }
    } catch (err) {
      console.error('[generateVehicleSpecs] Tech doc lookup failed:', err.message);
    }
  }

  const prompt = `You are a vehicle technical data specialist. Provide accurate workshop specifications for: ${vehicle}${techDocSection}

Return ONLY valid JSON matching this exact structure — no extra text, no markdown fences:
{
  "engineOil": { "grade": "", "capacity": "", "spec": "" },
  "coolant": { "type": "", "capacity": "", "mixRatio": "" },
  "brakeFluid": { "spec": "" },
  "transmission": { "type": "", "capacity": "" },
  "wheelTorque": { "nm": "", "lbft": "", "pattern": "" },
  "tyrePressures": { "front": "", "rear": "", "unit": "bar" },
  "serviceIntervals": { "oil": "", "airFilter": "", "timingBelt": "" },
  "notes": []
}

Critical accuracy requirements:
- serviceIntervals.timingBelt: state exactly whether this engine uses a dry timing belt, timing chain, or wet belt-in-oil (WBIO). If manufacturer tech data is provided above, use it as the definitive source. Include the replacement interval if applicable.
- engineOil: use the exact OEM-specified grade and standard for this engine.
- Use empty string for anything you are not confident about for this specific vehicle.
- Keep notes to 3 max — vehicle-specific warnings or critical tips only. Do not give generic advice.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('[generateVehicleSpecs] No JSON found in response for:', vehicle, '| response:', text.slice(0, 200));
      return null;
    }
    return JSON.parse(match[0]);
  } catch (err) {
    console.error('[generateVehicleSpecs] Error for:', vehicle, '|', err.message);
    return null;
  }
}

async function generateTrainingChat(history, question) {
  if (!client) return { answer: 'No API key configured.', inputTokens: 0, outputTokens: 0 };

  const systemPrompt = [
    'You are Bob, an expert automotive diagnostic and repair assistant for professional vehicle technicians.',
    'You are in training/consultation mode — there is no specific vehicle or job context.',
    '',
    'In this mode you can:',
    '- Answer questions about vehicle diagnostics, repair procedures, and technical specifications',
    '- Discuss faults, causes, and confirmed fixes for specific makes, models, or engine families',
    '- Acknowledge and validate technical information shared by experienced technicians',
    '- Help structure knowledge for storage in a workshop knowledge base',
    '',
    'When a technician shares a confirmed observation or repair from their own experience:',
    '- Acknowledge it specifically and concisely',
    '- Ask for any missing detail that would make it more useful as a KB entry (vehicle scope, DTC code, year range)',
    '',
    'Formatting:',
    '- Do not use emojis',
    '- Do not use markdown tables',
    '- Keep responses concise and professional',
  ].join('\n');

  const messages = history.slice(-12).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.text,
  }));
  messages.push({ role: 'user', content: question });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    answer: textBlock?.text || 'No response generated.',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

async function extractKnowledgeFromText(rawText) {
  if (!client) return { entries: [] };

  const prompt = `You are a knowledge base assistant for an automotive workshop. Extract structured knowledge entries from the following text written by an experienced technician.

Return ONLY a valid JSON array — no extra text, no markdown fences:
[
  {
    "title": "short descriptive title (max 80 chars)",
    "category": "one of: Common Fix, DTC Code, Vehicle Note, Service Interval, General",
    "content": "full technical detail written clearly for a workshop technician",
    "make": "vehicle make if specific, empty string if general",
    "model": "vehicle model if specific, empty string if general",
    "year_from": "4-digit year string if applicable, empty string if not",
    "year_to": "4-digit year string if applicable, empty string if not",
    "fault_code": "DTC or fault code if mentioned, empty string if none",
    "source": "Technician Experience"
  }
]

If the text contains multiple distinct pieces of knowledge, return multiple entries. If it is a single topic, return one entry.

Text:
${rawText}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return { entries: [] };
  try {
    return { entries: JSON.parse(match[0]) };
  } catch {
    return { entries: [] };
  }
}

async function generateAdminChat(history, question, userId) {
  if (!client) return { answer: 'No API key configured.', inputTokens: 0, outputTokens: 0 };

  const { adminToolDefinitions, createAdminToolHandlers } = require('./adminAgentTools');

  const systemPrompt = [
    'You are an admin assistant for a vehicle repair workshop management system.',
    'You help staff with day-to-day admin tasks via natural language.',
    '',
    'WHAT YOU CAN DO:',
    '- Create new jobs/projects (ask for the registration plate — vehicle details are looked up automatically)',
    '- Search for vehicles, customers, and existing projects',
    '- Create new customer records',
    '- List recent or active projects',
    '',
    'RULES:',
    '- Always confirm the key details with the user before creating anything.',
    '- When creating a project, ask for the registration plate first.',
    '- If a vehicle lookup might fail (no reg, foreign vehicle), ask for make/model/year as a fallback.',
    '- After successfully creating something, tell the user clearly what was created and where to find it.',
    '- Be concise and direct. No emojis. No markdown tables.',
  ].join('\n');

  const messages = history.slice(-14).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.text,
  }));
  messages.push({ role: 'user', content: question });

  const handlers = createAdminToolHandlers(userId);

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    tools: adminToolDefinitions,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const handler = handlers[toolUse.name];
      let result;
      try {
        result = handler ? await handler(toolUse.input) : { error: `Unknown tool: ${toolUse.name}` };
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      tools: adminToolDefinitions,
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    answer: textBlock?.text || 'No response generated.',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

module.exports = { generateRepairAdvice, generateVehicleSpecs, generateTrainingChat, extractKnowledgeFromText, generateAdminChat };
