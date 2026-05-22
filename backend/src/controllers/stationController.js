const metroGraph = require('../services/routeEngine');
const { findNearestStation } = require('../services/haversineService');

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

    const result = metroGraph.findShortestPath(source, destination);
    if (result.error) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/stations - all stations (for map rendering)
 */
exports.getAllStations = (req, res, next) => {
  try {
    const stations = metroGraph.getAllStations();
    res.json({ success: true, count: stations.length, data: stations });
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
