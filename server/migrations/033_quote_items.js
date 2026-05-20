exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id   UUID NOT NULL REFERENCES quotes ON DELETE CASCADE,
      title      TEXT NOT NULL,
      description TEXT,
      notes      TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS quote_items_quote_id_idx ON quote_items (quote_id)`);
  pgm.sql(`ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS quote_item_id UUID REFERENCES quote_items ON DELETE SET NULL`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE quote_lines DROP COLUMN IF EXISTS quote_item_id`);
  pgm.sql(`DROP TABLE IF EXISTS quote_items`);
};
