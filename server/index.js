require('dotenv').config();
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
