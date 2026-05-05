exports.up = (pgm) => {
  pgm.createTable('ai_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    project_id: { type: 'uuid', references: '"projects"', onDelete: 'SET NULL' },
    question_preview: { type: 'text' },
    answer_preview: { type: 'text' },
    input_tokens: { type: 'integer' },
    output_tokens: { type: 'integer' },
    model: { type: 'varchar(100)' },
    duration_ms: { type: 'integer' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('ai_requests', 'user_id');
  pgm.createIndex('ai_requests', 'project_id');
  pgm.createIndex('ai_requests', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('ai_requests');
};
