exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE workshop_settings
      ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE workshop_settings
      DROP COLUMN IF EXISTS ai_enabled
  `);
};
