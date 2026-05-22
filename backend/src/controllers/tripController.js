const { predictionEngine } = require('../services/predictionEngine');
const metroGraph = require('../services/routeEngine');
const Trip = require('../models/Trip');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/trips/start
 * Body: { source, destination, userId? }
 */
exports.startTrip = async (req, res, next) => {
  try {
    const { source, destination, userId } = req.body;

    if (!source || !destination) {
      return res.status(400).json({ success: false, message: 'source and destination are required' });
    }

    const routeResult = metroGraph.findShortestPath(source, destination);
    if (routeResult.error) {
      return res.status(404).json({ success: false, message: routeResult.error });
    }

    const tripId = uuidv4();
    predictionEngine.startTrip(tripId, routeResult.path);

    // Persist trip to MongoDB if model available
    try {
      const trip = await Trip.create({
        tripId,
        userId: userId || 'anonymous',
        source,
        destination,
        routePath: routeResult.path,
        interchanges: routeResult.interchanges,
        estimatedTime: routeResult.estimatedTime,
        status: 'active',
        startedAt: new Date(),
      });
    } catch (dbErr) {
      // DB not required for core functionality
      console.warn('DB save skipped:', dbErr.message);
    }

    res.json({
      success: true,
      data: {
        tripId,
        route: routeResult,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/trips/update-location
 * Body: { tripId, lat, lng, accuracy? }
 */
exports.updateLocation = async (req, res, next) => {
  try {
    const { tripId, lat, lng, accuracy = 50 } = req.body;

    if (!tripId || lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'tripId, lat, lng are required' });
    }

    const prediction = predictionEngine.predictCurrentStation(
      tripId,
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(accuracy)
    );

    if (prediction.error) {
      return res.status(404).json({ success: false, message: prediction.error });
    }

    // Emit realtime via Socket.IO (injected on app startup)
    const io = req.app.get('io');
    if (io) {
      io.to(tripId).emit('location-update', { tripId, ...prediction });
      if (prediction.shouldAlert) {
        io.to(tripId).emit('destination-alert', {
          tripId,
          message: `Get ready! Only ${prediction.stopsRemaining} stop(s) remaining.`,
          stopsRemaining: prediction.stopsRemaining,
        });
      }
    }

    res.json({ success: true, data: prediction });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/trips/:tripId/end
 */
exports.endTrip = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const visitedStations = predictionEngine.endTrip(tripId);

    try {
      await Trip.findOneAndUpdate(
        { tripId },
        { status: 'completed', completedAt: new Date(), visitedStations }
      );
    } catch (dbErr) {
      console.warn('DB update skipped:', dbErr.message);
    }

    res.json({ success: true, data: { tripId, visitedStations } });
  } catch (err) {
    next(err);
  }
};
