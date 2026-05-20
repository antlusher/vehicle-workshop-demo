exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS tech_documents (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title             TEXT NOT NULL,
      engine_group      TEXT,
      engine_codes      TEXT[] DEFAULT '{}',
      makes             TEXT[] DEFAULT '{}',
      original_filename TEXT,
      page_count        INTEGER,
      created_at        TIMESTAMPTZ DEFAULT now()
    )
  `);
  pgm.sql(`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS tech_document_id UUID REFERENCES tech_documents ON DELETE SET NULL`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE knowledge_base DROP COLUMN IF EXISTS tech_document_id`);
  pgm.sql(`DROP TABLE IF EXISTS tech_documents`);
};
