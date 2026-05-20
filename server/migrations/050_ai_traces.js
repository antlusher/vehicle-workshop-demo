exports.up = (pgm) => {
  pgm.createTable('ai_traces', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    workshop_id: { type: 'uuid', references: 'workshops', onDelete: 'SET NULL' },
    project_id: { type: 'uuid' },
    chat_mode: { type: 'varchar(20)' },
    question: { type: 'text', notNull: true },
    vehicle_context: { type: 'jsonb' },
    kb_chunks_retrieved: { type: 'jsonb' },
    tool_calls: { type: 'jsonb' },
    response: { type: 'text' },
    tokens_used: { type: 'integer' },
    latency_ms: { type: 'integer' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.addIndex('ai_traces', 'workshop_id');
  pgm.addIndex('ai_traces', 'created_at');
  pgm.addIndex('ai_traces', 'chat_mode');

  pgm.createTable('ai_trace_evals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    trace_id: { type: 'uuid', notNull: true, references: 'ai_traces', onDelete: 'CASCADE', unique: true },
    faithfulness: { type: 'numeric(4,3)' },
    answer_relevancy: { type: 'numeric(4,3)' },
    context_precision: { type: 'numeric(4,3)' },
    verdict: { type: 'varchar(20)' },
    judge_notes: { type: 'text' },
    evaluated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('ai_trace_evals');
  pgm.dropTable('ai_traces');
};
