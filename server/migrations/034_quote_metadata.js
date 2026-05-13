exports.up = async (pgm) => {
  pgm.sql(`
    ALTER TABLE quotes
      ADD COLUMN IF NOT EXISTS reference TEXT,
      ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES users ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ
  `);

  pgm.sql(`
    WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS n FROM quotes
    )
    UPDATE quotes SET reference = 'Q-' || LPAD(numbered.n::text, 4, '0')
    FROM numbered WHERE quotes.id = numbered.id AND quotes.reference IS NULL
  `);

  pgm.sql(`ALTER TABLE quotes ADD CONSTRAINT quotes_reference_unique UNIQUE (reference)`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_reference_unique`);
  pgm.sql(`
    ALTER TABLE quotes
      DROP COLUMN IF EXISTS sent_at,
      DROP COLUMN IF EXISTS title,
      DROP COLUMN IF EXISTS customer_id,
      DROP COLUMN IF EXISTS reference
  `);
};
