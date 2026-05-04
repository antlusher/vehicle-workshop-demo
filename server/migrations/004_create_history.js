exports.up = (pgm) => {
  pgm.createTable('project_history', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: '"projects"', onDelete: 'CASCADE' },
    role: { type: 'varchar(10)', notNull: true },
    text: { type: 'text', notNull: true },
    confirmed: { type: 'boolean', default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('project_history', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropTable('project_history');
};
