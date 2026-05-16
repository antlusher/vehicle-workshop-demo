const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query } = require('../services/db');
const { findUserByToken } = require('../services/authService');
const { s3Available, makeKey, uploadToS3, deleteFromS3 } = require('../services/mediaService');
const { sendReportPublished } = require('../services/emailService');

const router = express.Router();

// Fallback local storage when S3 is not configured
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only image or video files are allowed'));
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
    mediaType: row.media_type || 'image',
    createdAt: row.created_at,
  };
}

async function canAccessProject(projectId, user) {
  if (['owner', 'admin', 'sysadmin'].includes(user.role)) {
    const { rows } = await query('SELECT id FROM projects WHERE id = $1 AND workshop_id = $2', [projectId, user.workshopId]);
    return rows.length > 0;
  }
  const { rows } = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, user.id]);
  return rows.length > 0;
}

// GET report for a project
router.get('/:projectId', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query('SELECT * FROM job_reports WHERE project_id = $1', [req.params.projectId]);
  return res.json(rows.length ? toReport(rows[0]) : null);
});

// POST create/update report
router.post('/:projectId', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
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
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    `UPDATE job_reports SET status='published', published_at=now(), updated_at=now()
     WHERE project_id=$1 RETURNING *`,
    [req.params.projectId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Report not found — save it first' });

  // Fire-and-forget email to project customer if one is attached
  (async () => {
    try {
      const { rows: projRows } = await query(
        `SELECT p.make, p.model, p.year, p.registration_snapshot, p.registration,
                cu.id AS customer_id, cu.email AS customer_email, cu.name AS customer_name,
                w.name AS workshop_name, w.slug AS workshop_slug
         FROM projects p
         LEFT JOIN users cu ON cu.id = p.customer_id
         LEFT JOIN workshops w ON w.id = p.workshop_id
         WHERE p.id = $1`,
        [req.params.projectId]
      );
      const proj = projRows[0];
      if (!proj?.customer_email) return;

      // Generate magic link for customer portal
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await query(
        `UPDATE users SET magic_token=$1, magic_token_expires_at=$2 WHERE id=$3`,
        [token, expires, proj.customer_id]
      );

      const customerOrigin = process.env.CUSTOMER_PORTAL_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const portalUrl = `${customerOrigin}/portal?magic=${token}&project=${projectId}`;
      const vehicleDesc = [proj.year, proj.make, proj.model].filter(Boolean).join(' ') ||
                          proj.registration_snapshot || proj.registration || '';

      await sendReportPublished({
        to: proj.customer_email,
        customerName: proj.customer_name,
        workshopName: proj.workshop_name,
        vehicleDesc,
        portalUrl,
      });
    } catch (err) {
      console.error('[publish] email failed:', err.message);
    }
  })();

  return res.json(toReport(rows[0]));
});

// POST unpublish report
router.post('/:projectId/unpublish', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
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
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const { rows } = await query(
    'SELECT * FROM job_images WHERE project_id = $1 ORDER BY created_at ASC',
    [req.params.projectId]
  );
  return res.json(rows.map(toImage));
});

// GET presigned URL for an S3 media file
router.get('/media/url', requireAuth, async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const { getPresignedUrl } = require('../services/mediaService');
    const url = await getPresignedUrl(key);
    return res.json({ url });
  } catch {
    return res.status(500).json({ error: 'Could not generate URL' });
  }
});

// POST upload images/videos (S3 if configured, local fallback)
router.post('/:projectId/images', requireAuth, upload.array('images', 10), async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

  const captions = [].concat(req.body.captions || []);
  const saved = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const caption = captions[i] || '';
    const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    let filename;

    if (s3Available()) {
      filename = await uploadToS3(file.buffer, makeKey(req.params.projectId, file.originalname), file.mimetype);
    } else {
      // Local fallback
      const ext = path.extname(file.originalname).toLowerCase();
      filename = `${require('crypto').randomBytes(16).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    }

    const { rows } = await query(
      'INSERT INTO job_images (project_id, filename, original_name, caption, uploaded_by, media_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.projectId, filename, file.originalname, caption, req.user.id, mediaType]
    );
    saved.push(toImage(rows[0]));
  }
  return res.json(saved);
});

// PATCH update image caption
router.patch('/:projectId/images/:imageId', requireAuth, async (req, res) => {
  if (!await canAccessProject(req.params.projectId, req.user)) {
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
  if (!await canAccessProject(req.params.projectId, req.user)) {
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
