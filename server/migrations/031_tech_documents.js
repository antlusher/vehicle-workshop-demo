exports.up = (pgm) => {
  pgm.createTable('tech_documents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    title: { type: 'text', notNull: true },
    engine_group: { type: 'text' },
    engine_codes: { type: 'text[]', default: "'{}'" },
    makes: { type: 'text[]', default: "'{}'" },
    original_filename: { type: 'text' },
    page_count: { type: 'integer' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });

  pgm.addColumns('knowledge_base', {
    tech_document_id: {
      type: 'uuid',
      references: '"tech_documents"',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('knowledge_base', ['tech_document_id']);
  pgm.dropTable('tech_documents');
};
