exports.up = (pgm) => {
  pgm.createTable('projects', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    registration: { type: 'varchar(20)' },
    vin: { type: 'varchar(17)' },
    make: { type: 'varchar(100)' },
    model: { type: 'varchar(100)' },
    year: { type: 'varchar(10)' },
    engine_code: { type: 'varchar(100)' },
    fuel_type: { type: 'varchar(50)' },
    trim: { type: 'varchar(100)' },
    body_type: { type: 'varchar(100)' },
    source: { type: 'varchar(50)' },
    active: { type: 'boolean', notNull: true, default: true },
    closed: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('projects', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('projects');
};
