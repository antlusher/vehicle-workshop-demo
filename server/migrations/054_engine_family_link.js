exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE engine_codes
      ADD COLUMN IF NOT EXISTS family_id INTEGER REFERENCES engine_families(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_engine_codes_family_id ON engine_codes (family_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_engine_codes_family_id;
    ALTER TABLE engine_codes DROP COLUMN IF EXISTS family_id;
  `);
};
