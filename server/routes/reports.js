const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  findUserByToken(token).then((user) => {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: 'Authentication required' }));
}

function toReport(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    diagnosis: row.diagnosis || '',
    workCarriedOut: row.work_carried_out || '',
    technicianNotes: row.technician_notes || '',
    costParts: row.cost_parts ? parseFloat(row.cost_parts) : null,
    costLabour: row.cost_labour ? parseFloat(row.cost_labour) : null,
    costTotal: row.cost_total ? parseFloat(row.cost_total) : null,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toImage(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    originalName: row.original_name,
    caption: row.caption || '',
    createdAt: row.created_at,
  };
}

async function ownsProject(projectId, userId) {
  const { rows } = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  return rows.length > 0;
}

// GET report for a project
router.get('/:projectId', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query('SELECT * FROM job_reports WHERE project_id = $1', [req.params.projectId]);
  return res.json(rows.length ? toReport(rows[0]) : null);
});

// POST create/update report
router.post('/:projectId', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { diagnosis, workCarriedOut, technicianNotes, costParts, costLabour, costTotal } = req.body;
  const { rows } = await query(
    `INSERT INTO job_reports (project_id, diagnosis, work_carried_out, technician_notes, cost_parts, cost_labour, cost_total, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (project_id) DO UPDATE SET
       diagnosis=$2, work_carried_out=$3, technician_notes=$4,
       cost_parts=$5, cost_labour=$6, cost_total=$7, updated_at=now()
     RETURNING *`,
    [req.params.projectId, diagnosis || null, workCarriedOut || null, technicianNotes || null,
     costParts || null, costLabour || null, costTotal || null, req.user.id]
  );
  return res.json(toReport(rows[0]));
});

// POST publish report
router.post('/:projectId/publish', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE job_reports SET status='published', published_at=now(), updated_at=now()
     WHERE project_id=$1 RETURNING *`,
    [req.params.projectId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Report not found — save it first' });
  return res.json(toReport(rows[0]));
});

// POST unpublish report
router.post('/:projectId/unpublish', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE job_reports SET status='draft', published_at=NULL, updated_at=now()
     WHERE project_id=$1 RETURNING *`,
    [req.params.projectId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Report not found' });
  return res.json(toReport(rows[0]));
});

// GET images for a project
router.get('/:projectId/images', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    'SELECT * FROM job_images WHERE project_id = $1 ORDER BY created_at ASC',
    [req.params.projectId]
  );
  return res.json(rows.map(toImage));
});

// POST upload image(s)
router.post('/:projectId/images', requireAuth, upload.array('images', 10), async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    req.files?.forEach((f) => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Project not found' });
  }
  if (!req.files?.length) return res.status(400).json({ error: 'No images uploaded' });

  const captions = [].concat(req.body.captions || []);
  const saved = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const caption = captions[i] || '';
    const { rows } = await query(
      'INSERT INTO job_images (project_id, filename, original_name, caption, uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.projectId, file.filename, file.originalname, caption, req.user.id]
    );
    saved.push(toImage(rows[0]));
  }
  return res.json(saved);
});

// PATCH update image caption
router.patch('/:projectId/images/:imageId', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    'UPDATE job_images SET caption=$1 WHERE id=$2 AND project_id=$3 RETURNING *',
    [req.body.caption || '', req.params.imageId, req.params.projectId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Image not found' });
  return res.json(toImage(rows[0]));
});

// DELETE image
router.delete('/:projectId/images/:imageId', requireAuth, async (req, res) => {
  if (!await ownsProject(req.params.projectId, req.user.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    'DELETE FROM job_images WHERE id=$1 AND project_id=$2 RETURNING filename',
    [req.params.imageId, req.params.projectId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Image not found' });
  fs.unlink(path.join(uploadsDir, rows[0].filename), () => {});
  return res.json({ deleted: true });
});

module.exports = router;
