exports.up = (pgm) => {
  pgm.createTable('job_reports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, unique: true, references: '"projects"', onDelete: 'CASCADE' },
    diagnosis: { type: 'text' },
    work_carried_out: { type: 'text' },
    technician_notes: { type: 'text' },
    cost_parts: { type: 'numeric(10,2)' },
    cost_labour: { type: 'numeric(10,2)' },
    cost_total: { type: 'numeric(10,2)' },
    status: { type: 'varchar(20)', notNull: true, default: "'draft'" },
    published_at: { type: 'timestamptz' },
    created_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('job_reports', 'project_id');
  pgm.createIndex('job_reports', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('job_reports');
};
