exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS engine_families (
      id            SERIAL PRIMARY KEY,
      make          VARCHAR(60),
      family_name   VARCHAR(120),   -- marketing name e.g. "EcoBlue", "EcoBoost", "TDI"
      codename      VARCHAR(120),   -- internal codename e.g. "Panther", "Fox", "EA288"
      also_known_as TEXT[]  DEFAULT '{}',  -- other aliases from Wikipedia
      wiki_title    TEXT,
      wiki_url      TEXT,
      engine_codes  JSONB   DEFAULT '[]',  -- [{code, drivetrain, notes}]
      notes         TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_engine_families_make  ON engine_families (make);
    CREATE INDEX IF NOT EXISTS idx_engine_families_name  ON engine_families (LOWER(family_name));
    CREATE INDEX IF NOT EXISTS idx_engine_families_code  ON engine_families (LOWER(codename));
    CREATE INDEX IF NOT EXISTS idx_engine_families_codes ON engine_families USING gin (engine_codes);
    CREATE INDEX IF NOT EXISTS idx_engine_families_aka   ON engine_families USING gin (also_known_as);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS engine_families;`);
};
