exports.up = (pgm) => {
  pgm.createTable('login_history', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    ip_address: { type: 'varchar(45)' },
    user_agent: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('login_history', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('login_history');
};
