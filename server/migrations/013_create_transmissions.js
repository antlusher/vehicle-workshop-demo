exports.up = (pgm) => {
  pgm.createTable('transmissions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    code: { type: 'varchar(50)', notNull: true, unique: true },
    name: { type: 'varchar(200)' },
    type: { type: 'varchar(50)' },
    speeds: { type: 'integer' },
    known_makes: { type: 'text[]' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('transmissions', 'code');
};

exports.down = (pgm) => {
  pgm.dropTable('transmissions');
};
