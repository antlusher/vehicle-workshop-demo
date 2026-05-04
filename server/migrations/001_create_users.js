exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password: { type: 'varchar(255)', notNull: true },
    role: { type: 'varchar(50)', notNull: true, default: "'tech'" },
    subscribed: { type: 'boolean', notNull: true, default: false },
    session_active: { type: 'boolean', notNull: true, default: false },
    token: { type: 'varchar(255)' },
    reset_token: { type: 'varchar(255)' },
    reset_expiry: { type: 'timestamptz' },
    last_login_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'token');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
