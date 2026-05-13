require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { execSync } = require('child_process');
const authRouter = require('./routes/auth');
const vehiclesRouter = require('./routes/vehicles');
const projectsRouter = require('./routes/projects');
const aiRouter = require('./routes/ai');
const adminRouter = require('./routes/admin');
const registryRouter = require('./routes/registry');
const reportsRouter = require('./routes/reports');
const customerRouter = require('./routes/customer');
const quotesRouter = require('./routes/quotes');
const partsRouter = require('./routes/parts');
const techniciansRouter = require('./routes/technicians');
const sysadminRouter = require('./routes/sysadmin');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Serve uploaded job images as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/registry', registryRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/customer', customerRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/parts', partsRouter);
app.use('/api/technicians', techniciansRouter);
app.use('/api/sysadmin', sysadminRouter);

// Bootstrap: create the first sysadmin — only works when none exist yet
app.post('/api/bootstrap', async (req, res) => {
  const { query } = require('./services/db');
  const bcrypt = require('bcrypt');
  const crypto = require('crypto');
  const { email, password, secret } = req.body;
  if (secret !== (process.env.BOOTSTRAP_SECRET || 'changeme')) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = await query(`SELECT id FROM users WHERE role = 'sysadmin'`);
  if (existing.rows.length) return res.status(409).json({ error: 'A sysadmin already exists' });
  const emailCheck = await query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (emailCheck.rows.length) return res.status(409).json({ error: 'A user with that email already exists. Promote them via the database instead.' });
  const hashed = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await query(
    `INSERT INTO users (email, password, role, subscribed, token) VALUES ($1,$2,'sysadmin',true,$3) RETURNING id, email, role`,
    [email, hashed, token]
  );
  return res.status(201).json({ ...rows[0], message: 'Sysadmin created. You can now log in.' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Vehicle Workshop API is running' });
});

function runMigrations() {
  try {
    console.log('Running database migrations...');
    execSync('npm run migrate', {
      env: { ...process.env },
      stdio: 'inherit',
    });
    console.log('Migrations complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

runMigrations();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
