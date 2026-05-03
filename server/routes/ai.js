const express = require('express');
const { loadData, saveData } = require('../services/storage');
const { findUserByToken } = require('../services/authService');
const { generateRepairAdvice } = require('../services/aiService');
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

router.post('/ask', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = findUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { projectId, question } = req.body;
  if (!projectId || !question) {
    return res.status(400).json({ error: 'Project ID and question are required' });
  }

  const projects = loadData('projects.json', []);
  const projectIndex = projects.findIndex(
    (item) => item.id === projectId && item.userId === user.id,
  );

  if (projectIndex === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const project = projects[projectIndex];
  const history = project.history || [];

  try {
    const answer = await generateRepairAdvice(project, history, question);

    const questionEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      role: 'user',
      text: question,
      createdAt: new Date().toISOString(),
    };
    const answerEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      role: 'ai',
      text: answer,
      createdAt: new Date().toISOString(),
    };

    project.history = [...history, questionEntry, answerEntry];
    project.updatedAt = new Date().toISOString();
    projects[projectIndex] = project;
    saveData('projects.json', projects);

    return res.json({ project, answer });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'AI request failed' });
  }
});

module.exports = router;
