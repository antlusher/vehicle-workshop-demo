exports.up = (pgm) => {
  pgm.createTable('actor_sessions', {
    id: 'id',
    sysadmin_id: { type: 'integer', notNull: true },
    workshop_id: { type: 'integer', notNull: true },
    token: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('actor_sessions');
};
