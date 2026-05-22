const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');
const { query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// GET /api/stations
router.get('/', stationController.getAllStations);

// GET /api/stations/names
router.get('/names', stationController.getStationNames);

// GET /api/stations/nearest?lat=&lng=
router.get(
  '/nearest',
  [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid lat required'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid lng required'),
  ],
  validate,
  stationController.getNearestStation
);

// GET /api/stations/route?source=&destination=
router.get(
  '/route',
  [
    query('source').notEmpty().withMessage('source is required'),
    query('destination').notEmpty().withMessage('destination is required'),
  ],
  validate,
  stationController.getRoute
);

module.exports = router;
