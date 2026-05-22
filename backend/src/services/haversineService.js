const metroGraph = require('./routeEngine');

/**
 * Haversine formula: calculates straight-line distance
 * between two lat/lng points on Earth's surface (in metres)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the nearest metro station to a given GPS coordinate
 * Returns: { station, distanceMeters }
 */
function findNearestStation(userLat, userLng) {
  const allStations = metroGraph.getAllStations();

  if (!allStations || allStations.length === 0) {
    throw new Error('Station data unavailable');
  }

  let nearestStation = null;
  let minDistance = Infinity;

  allStations.forEach((station) => {
    if (station.lat == null || station.lng == null) return;
    const dist = haversineDistance(userLat, userLng, station.lat, station.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestStation = station;
    }
  });

  return {
    station: nearestStation,
    distanceMeters: Math.round(minDistance),
  };
}

/**
 * Get N nearest stations (useful for the prediction engine)
 */
function findNNearestStations(userLat, userLng, n = 3) {
  const allStations = metroGraph.getAllStations();

  const withDistances = allStations
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      station: s,
      distanceMeters: Math.round(haversineDistance(userLat, userLng, s.lat, s.lng)),
    }));

  withDistances.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return withDistances.slice(0, n);
}

module.exports = { haversineDistance, findNearestStation, findNNearestStations };
