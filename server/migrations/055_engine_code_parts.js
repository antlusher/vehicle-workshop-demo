exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE engine_codes
      ADD COLUMN IF NOT EXISTS common_parts JSONB DEFAULT '[]';

    CREATE INDEX IF NOT EXISTS idx_engine_codes_parts ON engine_codes USING gin (common_parts);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_engine_codes_parts;
    ALTER TABLE engine_codes DROP COLUMN IF EXISTS common_parts;
  `);
};
