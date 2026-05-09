const Anthropic = require('@anthropic-ai/sdk');
const { toolDefinitions, toolHandlers } = require('./agentTools');

function createClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const client = createClient();

function buildSystemPrompt(project, crossWorkshopFixes = [], chatMode = 'diagnose') {
  const isHowTo = chatMode === 'howto';
  const lines = [
    'You are an expert automotive assistant for professional vehicle repair technicians.',
    'You have access to a workshop knowledge base and vehicle database via tools.',
    '',
  ];

  // Vehicle identity — always included so procedures are vehicle-specific
  lines.push('Current vehicle:');
  if (project.registration) lines.push(`Registration: ${project.registration}`);
  if (project.vin) lines.push(`VIN: ${project.vin}`);
  if (project.make) lines.push(`Make: ${project.make}`);
  if (project.model) lines.push(`Model: ${project.model}`);
  if (project.year) lines.push(`Year: ${project.year}`);
  if (project.engineCode) lines.push(`Engine code: ${project.engineCode}`);
  if (project.fuelType) lines.push(`Fuel type: ${project.fuelType}`);
  if (project.bodyType) lines.push(`Body type: ${project.bodyType}`);
  lines.push('');

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

async function runAgentLoop(client, project, history, question, crossWorkshopFixes = [], chatMode = 'diagnose') {
  const messages = buildMessages(history, question);
  const systemPrompt = buildSystemPrompt(project, crossWorkshopFixes, chatMode);

  // How To mode only gets the specs tool — history/fix tools are irrelevant for procedures
  const tools = chatMode === 'howto'
    ? toolDefinitions.filter((t) => t.name === 'get_vehicle_specs')
    : toolDefinitions;

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

Critical accuracy requirements:
- serviceIntervals.timingBelt: state exactly whether this engine uses a dry timing belt, timing chain, or wet belt-in-oil (WBIO). Wet belt-in-oil systems (e.g. Ford 1.0 EcoBoost, Ford 2.0 EcoBlue Panther, some PSA/Stellantis engines) have distinct service requirements and must not be described as a chain. Include the replacement interval if applicable.
- engineOil: use the exact OEM-specified grade and standard for this engine — incorrect oil on wet-belt engines damages the belt.
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
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

module.exports = { generateRepairAdvice, generateVehicleSpecs };
