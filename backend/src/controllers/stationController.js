const metroGraph = require('../services/routeEngine');
const { findNearestStation } = require('../services/haversineService');
const congestionService = require('../services/congestionService');

/**
 * GET /api/nearest-station?lat=&lng=
 */
exports.getNearestStation = (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'lat and lng are required query params' });
    }

    const result = findNearestStation(lat, lng);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/route?source=&destination=
 */
exports.getRoute = (req, res, next) => {
  try {
    const { source, destination } = req.query;
    if (!source || !destination) {
      return res.status(400).json({ success: false, message: 'source and destination are required' });
    }

    const shortest = metroGraph.findShortestPath(source, destination);
    if (shortest.error) {
      return res.status(404).json({ success: false, message: shortest.error });
    }

    const minInterchanges = metroGraph.findMinInterchangesPath(source, destination);
    if (minInterchanges.error) {
      return res.status(404).json({ success: false, message: minInterchanges.error });
    }

    const shortestDistance = metroGraph.findShortestDistancePath(source, destination);
    if (shortestDistance.error) {
      return res.status(404).json({ success: false, message: shortestDistance.error });
    }

    const lessCongested = metroGraph.findLessCongestedPath(source, destination);
    if (lessCongested.error) {
      return res.status(404).json({ success: false, message: lessCongested.error });
    }

    res.json({
      success: true,
      data: {
        shortest,
        minInterchanges,
        shortestDistance,
        lessCongested,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/stations - all stations (for map rendering)
 */
exports.getAllStations = (req, res, next) => {
  try {
    const rawStations = metroGraph.getAllStations();
    const stationsWithCongestion = rawStations.map(s => {
      const score = congestionService.getCongestionScore(s.name);
      return {
        ...s,
        congestion: {
          score,
          label: congestionService.getCongestionLabel(score),
          colorClass: congestionService.getCongestionColorClass(score)
        }
      };
    });
    res.json({ success: true, count: stationsWithCongestion.length, data: stationsWithCongestion });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/stations/names - just names for autocomplete
 */
exports.getStationNames = (req, res, next) => {
  try {
    const names = metroGraph.getAllStationNames();
    res.json({ success: true, data: names });
  } catch (err) {
    next(err);
  }
};
