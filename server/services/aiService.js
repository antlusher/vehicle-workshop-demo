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
    'Provide clear, structured, technician-friendly guidance with likely causes and recommended checks.',
    'If a DTC code is mentioned, use the get_dtc_info tool.',
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

module.exports = { generateRepairAdvice };
