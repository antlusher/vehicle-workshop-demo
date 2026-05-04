exports.up = (pgm) => {
  pgm.createTable('events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    event_type: { type: 'varchar(100)', notNull: true },
    payload: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('events', 'user_id');
  pgm.createIndex('events', 'event_type');
  pgm.createIndex('events', 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable('events');
};
