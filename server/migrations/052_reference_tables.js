exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS dtc_codes (
      code            VARCHAR(8)   PRIMARY KEY,
      description     TEXT,
      system          VARCHAR(20),
      fault_location  TEXT,
      probable_cause  TEXT,
      meaning         TEXT,
      causes          TEXT,
      symptoms        TEXT,
      how_to          TEXT,
      related_codes   TEXT[]       DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS engine_codes (
      id                   SERIAL PRIMARY KEY,
      make                 VARCHAR(60),
      code                 VARCHAR(120),
      fuel_type            VARCHAR(60),
      name                 TEXT,
      description          TEXT,
      specs                JSONB    DEFAULT '{}',
      compatible_vehicles  JSONB    DEFAULT '[]',
      reliability_summary  TEXT,
      reliability_issues   JSONB    DEFAULT '[]',
      faq_items            JSONB    DEFAULT '[]',
      related_engines      JSONB    DEFAULT '[]',
      url                  TEXT,
      UNIQUE (make, code)
    );

    CREATE INDEX IF NOT EXISTS idx_engine_codes_make ON engine_codes (make);
    CREATE INDEX IF NOT EXISTS idx_engine_codes_specs ON engine_codes USING gin (specs);

    CREATE TABLE IF NOT EXISTS vehicle_specs (
      id           SERIAL PRIMARY KEY,
      make         VARCHAR(60),
      model        VARCHAR(60),
      body_type    VARCHAR(60),
      year_from    INTEGER,
      year_to      INTEGER,
      trim         TEXT,
      engine_size  VARCHAR(20),
      bhp          INTEGER,
      url          TEXT UNIQUE,
      specs        JSONB DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_vehicle_specs_make_model ON vehicle_specs (make, model);
    CREATE INDEX IF NOT EXISTS idx_vehicle_specs_year ON vehicle_specs (year_from, year_to);
    CREATE INDEX IF NOT EXISTS idx_vehicle_specs_specs ON vehicle_specs USING gin (specs);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS vehicle_specs;
    DROP TABLE IF EXISTS engine_codes;
    DROP TABLE IF EXISTS dtc_codes;
  `);
};
