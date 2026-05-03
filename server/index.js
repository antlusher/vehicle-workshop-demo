require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');
const vehiclesRouter = require('./routes/vehicles');
const projectsRouter = require('./routes/projects');
const aiRouter = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/ai', aiRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Vehicle Workshop API is running' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
