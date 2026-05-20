exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS gates_fitment (
      id              SERIAL PRIMARY KEY,
      make            VARCHAR(60)  NOT NULL DEFAULT 'Ford',
      model           TEXT,
      engine_codes    TEXT[]       NOT NULL DEFAULT '{}',
      stroke          VARCHAR(20),
      kw              INTEGER,
      year_from_year  INTEGER,
      year_from_month INTEGER,
      year_to_year    INTEGER,
      year_to_month   INTEGER,
      part_type       VARCHAR(60)  NOT NULL,
      article_group   TEXT,
      article_no      VARCHAR(60)  NOT NULL,
      brand           VARCHAR(40)  NOT NULL DEFAULT 'Gates',
      powered_units   TEXT,
      comments        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_gates_fitment_engine_codes
      ON gates_fitment USING gin (engine_codes);

    CREATE INDEX IF NOT EXISTS idx_gates_fitment_article_no
      ON gates_fitment (article_no);

    CREATE INDEX IF NOT EXISTS idx_gates_fitment_part_type
      ON gates_fitment (part_type);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS gates_fitment;`);
};
