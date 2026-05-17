const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('./db');

function extractTextFromBlocks(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return '';
}

function buildContext(kbChunks, toolCalls) {
  const parts = [];

  (kbChunks || []).forEach((c) => {
    parts.push(`[KB: ${c.title || 'Untitled'}]\n${c.content}`);
  });

  (toolCalls || []).forEach((t) => {
    if (t.tool === 'search_knowledge_base' && t.output?.results?.length) {
      t.output.results.forEach((r) => {
        if (r.source !== 'confirmed_fix') {
          parts.push(`[KB Tool: ${r.title || 'Untitled'}]\n${r.answer}`);
        }
      });
    }
  });

  return parts.join('\n\n---\n\n');
}

async function evaluateTrace(trace) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const ctx = buildContext(trace.kb_chunks_retrieved, trace.tool_calls);
  const hasCtx = ctx.trim().length > 0;
  const vehicleStr = trace.vehicle_context
    ? [trace.vehicle_context.make, trace.vehicle_context.model, trace.vehicle_context.year,
       trace.vehicle_context.engineCode ? `(${trace.vehicle_context.engineCode})` : null]
        .filter(Boolean).join(' ')
    : 'Not specified';

  const responseText = extractTextFromBlocks(trace.response);

  const prompt = `You are evaluating a RAG system response for an automotive workshop AI assistant. Score each metric and return JSON only.

QUESTION: ${trace.question}

VEHICLE: ${vehicleStr}

RETRIEVED CONTEXT:
${hasCtx ? ctx : '(None — AI used training knowledge only)'}

AI RESPONSE:
${responseText}

Return ONLY this JSON (no markdown, no explanation):
{
  "faithfulness": <0.0-1.0>,
  "answer_relevancy": <0.0-1.0>,
  "context_precision": <0.0-1.0>,
  "verdict": "<pass|partial|fail>",
  "judge_notes": "<2-3 sentences covering: what was retrieved, whether the answer is grounded in it, and any hallucinations or missing steps>"
}

SCORING:
faithfulness: Every factual claim in the response is supported by the retrieved context. 1.0 = fully grounded. 0.0 = contradicts or ignores context. If no context retrieved, score 0.5 if the response is conservative/generic, lower if it states specific facts without basis.
answer_relevancy: Does the response directly and completely answer the question? 1.0 = fully answers it. 0.0 = misses the point entirely.
context_precision: Are the retrieved KB chunks the right ones for this question? 1.0 = all chunks relevant. 0.0 = wrong/irrelevant chunks. 0.5 if no chunks retrieved but none were expected.
verdict: pass = all scores >= 0.7. fail = any score < 0.4. partial = otherwise.`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Judge returned non-JSON: ' + raw.slice(0, 200));
  const parsed = JSON.parse(match[0]);

  return {
    faithfulness: Math.min(1, Math.max(0, parseFloat(parsed.faithfulness) || 0)),
    answer_relevancy: Math.min(1, Math.max(0, parseFloat(parsed.answer_relevancy) || 0)),
    context_precision: Math.min(1, Math.max(0, parseFloat(parsed.context_precision) || 0)),
    verdict: ['pass', 'partial', 'fail'].includes(parsed.verdict) ? parsed.verdict : 'partial',
    judge_notes: parsed.judge_notes || '',
  };
}

async function saveTrace(traceData) {
  const { workshopId, projectId, chatMode, question, vehicleContext, kbChunksRetrieved, toolCalls, response, tokensUsed, latencyMs } = traceData;
  const { rows } = await query(
    `INSERT INTO ai_traces (workshop_id, project_id, chat_mode, question, vehicle_context, kb_chunks_retrieved, tool_calls, response, tokens_used, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      workshopId || null,
      projectId || null,
      chatMode || null,
      question,
      vehicleContext ? JSON.stringify(vehicleContext) : null,
      kbChunksRetrieved ? JSON.stringify(kbChunksRetrieved) : null,
      toolCalls ? JSON.stringify(toolCalls) : null,
      typeof response === 'string' ? response : JSON.stringify(response),
      tokensUsed || null,
      latencyMs || null,
    ]
  );
  return rows[0].id;
}

async function saveEval(traceId, scores) {
  await query(
    `INSERT INTO ai_trace_evals (trace_id, faithfulness, answer_relevancy, context_precision, verdict, judge_notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (trace_id) DO UPDATE SET
       faithfulness=$2, answer_relevancy=$3, context_precision=$4,
       verdict=$5, judge_notes=$6, evaluated_at=now()`,
    [traceId, scores.faithfulness, scores.answer_relevancy, scores.context_precision, scores.verdict, scores.judge_notes]
  );
}

module.exports = { evaluateTrace, saveTrace, saveEval };
