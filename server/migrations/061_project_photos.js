exports.up = (pgm) => {
  pgm.createTable('project_photos', {
    id:            { type: 'serial', primaryKey: true },
    project_id:    { type: 'integer', notNull: true, references: 'projects(id)', onDelete: 'CASCADE' },
    filename:      { type: 'text', notNull: true },
    original_name: { type: 'text' },
    mime_type:     { type: 'text' },
    size:          { type: 'integer' },
    caption:       { type: 'text' },
    tags:          { type: 'text[]', default: "'{}'" },
    uploaded_by:   { type: 'integer', references: 'users(id)', onDelete: 'SET NULL' },
    created_at:    { type: 'timestamp', default: pgm.func('now()') },
  });
  pgm.createIndex('project_photos', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropTable('project_photos');
};
