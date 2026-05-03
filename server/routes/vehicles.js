const express = require('express');
const { lookupVehicle } = require('../services/vehicleProviders');
const router = express.Router();

router.post('/lookup', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Vehicle registration or VIN is required' });
  }

  try {
    const vehicle = await lookupVehicle(identifier);
    return res.json(vehicle);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Lookup failed' });
  }
});

module.exports = router;
