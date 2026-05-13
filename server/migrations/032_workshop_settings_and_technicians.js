exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE workshop_settings
      ADD COLUMN IF NOT EXISTS workshop_name  TEXT,
      ADD COLUMN IF NOT EXISTS address_line1  TEXT,
      ADD COLUMN IF NOT EXISTS address_line2  TEXT,
      ADD COLUMN IF NOT EXISTS city           TEXT,
      ADD COLUMN IF NOT EXISTS postcode       TEXT,
      ADD COLUMN IF NOT EXISTS phone          TEXT,
      ADD COLUMN IF NOT EXISTS email          TEXT,
      ADD COLUMN IF NOT EXISTS payment_notes  TEXT
  `);
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS technicians (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      role        TEXT,
      email       TEXT,
      phone       TEXT,
      hourly_rate NUMERIC(8,2),
      active      BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS technicians`);
  pgm.sql(`
    ALTER TABLE workshop_settings
      DROP COLUMN IF EXISTS workshop_name,
      DROP COLUMN IF EXISTS address_line1,
      DROP COLUMN IF EXISTS address_line2,
      DROP COLUMN IF EXISTS city,
      DROP COLUMN IF EXISTS postcode,
      DROP COLUMN IF EXISTS phone,
      DROP COLUMN IF EXISTS email,
      DROP COLUMN IF EXISTS payment_notes
  `);
};
