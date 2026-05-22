const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// POST /api/trips/start
router.post(
  '/start',
  [
    body('source').notEmpty().withMessage('source is required'),
    body('destination').notEmpty().withMessage('destination is required'),
  ],
  validate,
  tripController.startTrip
);

// POST /api/trips/update-location
router.post(
  '/update-location',
  [
    body('tripId').notEmpty().withMessage('tripId is required'),
    body('lat').isFloat().withMessage('Valid lat required'),
    body('lng').isFloat().withMessage('Valid lng required'),
  ],
  validate,
  tripController.updateLocation
);

// POST /api/trips/:tripId/end
router.post('/:tripId/end', tripController.endTrip);

module.exports = router;
