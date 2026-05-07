exports.up = (pgm) => {
  pgm.createTable('job_images', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    project_id: { type: 'uuid', notNull: true, references: '"projects"', onDelete: 'CASCADE' },
    filename: { type: 'varchar(255)', notNull: true },
    original_name: { type: 'varchar(255)' },
    caption: { type: 'text' },
    uploaded_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('job_images', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropTable('job_images');
};
