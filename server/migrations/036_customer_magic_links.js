exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS magic_token TEXT,
      ADD COLUMN IF NOT EXISTS magic_token_expires_at TIMESTAMPTZ
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS users_magic_token_idx ON users (magic_token) WHERE magic_token IS NOT NULL`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS users_magic_token_idx`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS magic_token, DROP COLUMN IF EXISTS magic_token_expires_at`);
};
