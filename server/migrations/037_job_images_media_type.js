exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE job_images ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE job_images DROP COLUMN IF EXISTS media_type`);
};
