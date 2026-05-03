const OpenAI = require('openai');

function createOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const client = createOpenAIClient();

function summarizeProject(project) {
  const lines = [];
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

function buildPrompt(project, history, question) {
  const summary = summarizeProject(project);
  const recentHistory = history
    .slice(-6)
    .map((entry) => `${entry.role === 'user' ? 'User' : 'AI'}: ${entry.text}`)
    .join('\n');

  return `You are a technical guidance assistant for vehicle repair professionals.
Use the project information and technical data when answering. Do not invent unsupported details.

Vehicle project summary:
${summary}

Recent context:
${recentHistory || 'None'}

Question:
${question}

Provide a technician-friendly workflow, likely causes, and recommended checks or repairs.`;
}

async function generateRepairAdvice(project, history = [], question) {
  const prompt = buildPrompt(project, history, question);

  if (!client) {
    return `Demo fallback guidance (OpenAI not configured):\n\n- Verify ignition system health: spark plugs, coils, and wiring.\n- Check for misfire codes on cylinder 3 and inspect the coil pack or plug.\n- Confirm fuel pressure and injector operation for the affected cylinder.\n- Review service history for timing belt/chain issues or compression loss.\n- Use the vehicle details when diagnosing: ${project.make || 'Unknown make'} ${project.model || 'Unknown model'} ${project.year || ''}.\n\nQuestion: ${question}`;
  }

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
  });

  const output = response.output?.[0]?.content?.find((item) => item.type === 'output_text')?.text;
  if (output) {
    return output;
  }

  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  return 'No advice could be generated. Please try again.';
}

module.exports = {
  generateRepairAdvice,
};
