const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('./db');
const { toolDefinitions, toolHandlers } = require('./agentTools');
const { workshopToolDefinitions, workshopToolHandlers } = require('./workshopTools');
const { buildSystemPrompt, buildMessages, fetchEngineDocSummary } = require('./ai/systemPrompt');

function createClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const client = createClient();

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

async function runAgentLoop(agentClient, project, history, question, crossWorkshopFixes = [], chatMode = 'diagnose') {
  const startMs = Date.now();
  const { saveTrace } = require('./ragasEval');

  const docResult = chatMode !== 'workshop'
    ? await fetchEngineDocSummary(project.engineCode, question, project)
    : { summary: '', chunks: [] };

  const messages = buildMessages(history, question);
  const systemPrompt = buildSystemPrompt(project, crossWorkshopFixes, chatMode, docResult.summary);

  const isWorkshop = chatMode === 'workshop';
  const tools = isWorkshop
    ? workshopToolDefinitions
    : chatMode === 'howto'
      ? toolDefinitions.filter((t) => ['get_vehicle_specs', 'search_knowledge_base', 'web_search', 'web_fetch'].includes(t.name))
      : toolDefinitions;
  const handlers = isWorkshop ? workshopToolHandlers : toolHandlers;

  const traceToolCalls = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  let response = await agentClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  });
  totalInputTokens += response.usage?.input_tokens || 0;
  totalOutputTokens += response.usage?.output_tokens || 0;

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

      traceToolCalls.push({ tool: toolUse.name, input: toolUse.input, output: result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await agentClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });
    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const answerText = textBlock?.text || 'No response generated.';

  saveTrace({
    workshopId: project.workshopId || null,
    projectId: project.id || null,
    chatMode,
    question,
    vehicleContext: {
      make: project.make, model: project.model, year: project.year,
      engineCode: project.engineCode, fuelType: project.fuelType,
    },
    kbChunksRetrieved: docResult.chunks,
    toolCalls: traceToolCalls,
    response: answerText,
    tokensUsed: totalInputTokens + totalOutputTokens,
    latencyMs: Date.now() - startMs,
  }).catch((err) => console.error('[trace]', err.message));

  return {
    answer: answerText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
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

  const prompt = `You are a knowledge base assistant for an automotive workshop. Your job is to extract ONLY genuinely useful automotive technical knowledge from the text below.

STRICT RULES:
- Include ONLY content that is directly useful to a vehicle technician: repair procedures, diagnostic steps, part specifications, service intervals, known faults, DTC codes, fluid specs, torque values, timing data.
- DISCARD completely: table of contents, index pages, legal disclaimers, copyright notices, warranty text, promotional copy, contact details, serial numbers, part catalogue lists with no technical context, navigation menus, adverts, or any content that does not convey actionable technical knowledge.
- If the text contains no extractable technical knowledge, return an empty array [].
- Do NOT invent or embellish — only extract what is explicitly stated.
- Split into separate entries by distinct topic (e.g. one entry per fault code, one per procedure, one per fluid spec). Do not merge unrelated topics.
- Keep content concise but complete — a technician must be able to act on it without the original document.

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

async function generateAdminChat(history, question, userId, workshopId) {
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

  const handlers = createAdminToolHandlers(userId, workshopId);

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
