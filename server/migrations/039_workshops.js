exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS workshops (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'professional',
      ai_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
      ai_monthly_token_limit INTEGER DEFAULT 100000,
      features JSONB NOT NULL DEFAULT '{}',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  pgm.sql(`
    INSERT INTO workshops (id, name, slug)
    SELECT
      '00000000-0000-0000-0000-000000000001'::uuid,
      COALESCE((SELECT workshop_name FROM workshop_settings LIMIT 1), 'Default Workshop'),
      'default'
    WHERE NOT EXISTS (
      SELECT 1 FROM workshops WHERE id = '00000000-0000-0000-0000-000000000001'
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS workshops CASCADE`);
};
