const DEFAULT_WS = '00000000-0000-0000-0000-000000000001';

exports.up = (pgm) => {
  // ── Add workshop_id to key tables ──────────────────────────────────────────
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id)`);
  pgm.sql(`UPDATE users SET workshop_id = '${DEFAULT_WS}' WHERE workshop_id IS NULL AND role NOT IN ('sysadmin', 'customer')`);
  pgm.sql(`UPDATE users SET workshop_id = '${DEFAULT_WS}' WHERE workshop_id IS NULL AND role = 'customer'`);

  pgm.sql(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id)`);
  pgm.sql(`UPDATE projects SET workshop_id = '${DEFAULT_WS}' WHERE workshop_id IS NULL`);

  pgm.sql(`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id)`);
  pgm.sql(`UPDATE knowledge_base SET workshop_id = '${DEFAULT_WS}' WHERE workshop_id IS NULL`);

  pgm.sql(`ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id)`);
  pgm.sql(`UPDATE ai_requests SET workshop_id = '${DEFAULT_WS}' WHERE workshop_id IS NULL`);

  pgm.sql(`ALTER TABLE parts_catalogue ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id)`);
  pgm.sql(`UPDATE parts_catalogue SET workshop_id = '${DEFAULT_WS}' WHERE workshop_id IS NULL`);

  // ── Role permissions per workshop ──────────────────────────────────────────
  // Defines what 'tech' and 'admin' can access within a workshop.
  // 'manager' and 'sysadmin' always have full access.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS workshop_role_permissions (
      workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('tech', 'admin')),
      feature TEXT NOT NULL,
      allowed BOOLEAN NOT NULL DEFAULT false,
      UNIQUE(workshop_id, role, feature)
    )
  `);

  // Seed default permissions for the default workshop
  pgm.sql(`
    INSERT INTO workshop_role_permissions (workshop_id, role, feature, allowed) VALUES
      ('${DEFAULT_WS}', 'tech', 'customers',         false),
      ('${DEFAULT_WS}', 'tech', 'knowledge_base',    true),
      ('${DEFAULT_WS}', 'tech', 'registry',          false),
      ('${DEFAULT_WS}', 'tech', 'inventory',         false),
      ('${DEFAULT_WS}', 'tech', 'financials',        false),
      ('${DEFAULT_WS}', 'admin', 'users',            false),
      ('${DEFAULT_WS}', 'admin', 'workshop_settings',false)
    ON CONFLICT DO NOTHING
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS workshop_role_permissions`);
  pgm.sql(`ALTER TABLE parts_catalogue DROP COLUMN IF EXISTS workshop_id`);
  pgm.sql(`ALTER TABLE ai_requests DROP COLUMN IF EXISTS workshop_id`);
  pgm.sql(`ALTER TABLE knowledge_base DROP COLUMN IF EXISTS workshop_id`);
  pgm.sql(`ALTER TABLE projects DROP COLUMN IF EXISTS workshop_id`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS workshop_id`);
};
