const express = require('express');
const { loadData, saveData } = require('../services/storage');
const { lookupVehicle } = require('../services/vehicleProviders');
const { findUserByToken } = require('../services/authService');
const router = express.Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

function findProject(userId, projectId) {
  const projects = loadData('projects.json', []);
  return projects.find((project) => project.id === projectId && project.userId === userId);
}

router.get('/', requireAuth, (req, res) => {
  const projects = loadData('projects.json', []);
  const userProjects = projects.filter((project) => project.userId === req.user.id);
  return res.json(userProjects);
});

router.post('/', requireAuth, async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Vehicle registration or VIN is required' });
  }

  try {
    const vehicleData = await lookupVehicle(identifier);
    const projects = loadData('projects.json', []);
    const project = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      userId: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
      closed: false,
      history: [],
      ...vehicleData,
    };

    projects.push(project);
    saveData('projects.json', projects);
    return res.json(project);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to create project' });
  }
});

router.get('/:projectId', requireAuth, (req, res) => {
  const project = findProject(req.user.id, req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  return res.json(project);
});

router.post('/:projectId/close', requireAuth, (req, res) => {
  const projects = loadData('projects.json', []);
  const index = projects.findIndex(
    (project) => project.id === req.params.projectId && project.userId === req.user.id,
  );
  if (index === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  projects[index].closed = true;
  projects[index].active = false;
  projects[index].updatedAt = new Date().toISOString();
  saveData('projects.json', projects);

  return res.json(projects[index]);
});

module.exports = router;
