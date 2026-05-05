exports.up = (pgm) => {
  pgm.createTable('knowledge_base', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    category: { type: 'varchar(100)', notNull: true },
    make: { type: 'varchar(100)' },
    model: { type: 'varchar(100)' },
    year_from: { type: 'varchar(10)' },
    year_to: { type: 'varchar(10)' },
    fault_code: { type: 'varchar(20)' },
    title: { type: 'text', notNull: true },
    content: { type: 'text', notNull: true },
    source: { type: 'varchar(100)' },
    created_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('knowledge_base', 'category');
  pgm.createIndex('knowledge_base', ['make', 'model']);
  pgm.createIndex('knowledge_base', 'fault_code');
};

exports.down = (pgm) => {
  pgm.dropTable('knowledge_base');
};
