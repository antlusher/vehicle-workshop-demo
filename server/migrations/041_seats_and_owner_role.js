const { query } = require('../services/db');

const PLAN_SEATS = { starter: 3, professional: 10, enterprise: 0 };

async function up() {
  // Add seat_limit to workshops
  await query(`ALTER TABLE workshops ADD COLUMN IF NOT EXISTS seat_limit INTEGER NOT NULL DEFAULT 10`);

  // Set seat_limit based on existing plan values
  await query(`
    UPDATE workshops SET seat_limit = CASE
      WHEN plan = 'starter'      THEN 3
      WHEN plan = 'professional' THEN 10
      WHEN plan = 'enterprise'   THEN 0
      ELSE 10
    END
  `);

  // Rename manager → owner in users role check constraint
  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('owner','admin','tech','customer','sysadmin'))
  `);
  await query(`UPDATE users SET role = 'owner' WHERE role = 'manager'`);

  console.log('Migration 041: seat_limit added, manager→owner renamed');
}

module.exports = { up };
