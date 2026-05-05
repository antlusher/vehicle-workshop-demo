const Anthropic = require('@anthropic-ai/sdk');
const { toolDefinitions, toolHandlers } = require('./agentTools');

function createClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const client = createClient();

function buildSystemPrompt(project) {
  const lines = [
    'You are an expert automotive diagnostic assistant for professional vehicle repair technicians.',
    'You have access to a workshop knowledge base and vehicle database via tools.',
    'Always use your tools to check for confirmed fixes and vehicle specs before answering.',
    'Provide clear, structured, technician-friendly guidance.',
    'If a DTC code is mentioned, use the get_dtc_info tool.',
    '',
    'STRICT formatting rules — follow these exactly:',
    '- Do NOT use emojis anywhere in your response.',
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
    '',
    'Current vehicle project:',
  ];

  if (project.registration) lines.push(`Registration: ${project.registration}`);
  if (project.vin) lines.push(`VIN: ${project.vin}`);
  if (project.make) lines.push(`Make: ${project.make}`);
  if (project.model) lines.push(`Model: ${project.model}`);
  if (project.year) lines.push(`Year: ${project.year}`);
  if (project.engineCode) lines.push(`Engine code: ${project.engineCode}`);
  if (project.fuelType) lines.push(`Fuel type: ${project.fuelType}`);
  if (project.bodyType) lines.push(`Body type: ${project.bodyType}`);

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

async function runAgentLoop(client, project, history, question) {
  const messages = buildMessages(history, question);
  const systemPrompt = buildSystemPrompt(project);

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    tools: toolDefinitions,
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const handler = toolHandlers[toolUse.name];
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
      tools: toolDefinitions,
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text || 'No response generated.';
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

async function generateRepairAdvice(project, history = [], question) {
  if (!client) {
    return demoFallback(project, question);
  }
  return runAgentLoop(client, project, history, question);
}

async function generateVehicleSpecs(project) {
  if (!client) return null;

  const vehicle = [project.year, project.make, project.model, project.engineCode, project.fuelType, project.trim]
    .filter(Boolean).join(' ');

  const prompt = `You are a vehicle technical data specialist. Provide accurate workshop specifications for: ${vehicle}

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

Use empty string for anything you are not confident about for this specific vehicle. Keep notes to 3 max — vehicle-specific warnings or critical tips only.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

module.exports = { generateRepairAdvice, generateVehicleSpecs };
