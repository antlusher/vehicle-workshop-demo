exports.up = (pgm) => {
  pgm.createTable('engines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    code: { type: 'varchar(50)', notNull: true, unique: true },
    name: { type: 'varchar(200)' },
    fuel_type: { type: 'varchar(50)' },
    displacement: { type: 'varchar(20)' },
    aspiration: { type: 'varchar(50)' },
    known_makes: { type: 'text[]' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('engines', 'code');
};

exports.down = (pgm) => {
  pgm.dropTable('engines');
};
