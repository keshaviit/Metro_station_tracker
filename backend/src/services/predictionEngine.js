const metroGraph = require('./routeEngine');
const { findNNearestStations } = require('./haversineService');

/**
 * TripState tracks a user's in-progress journey
 * enabling direction inference and smart prediction
 */
class TripState {
  constructor(routePath) {
    this.routePath = routePath;           // planned full route
    this.visitedStations = [];            // stations confirmed visited
    this.currentIndex = 0;               // position along planned route
    this.lastKnownStation = null;
    this.direction = null;               // 'forward' | 'backward'
  }

  /** Mark a station as visited, update direction */
  updateStation(stationName) {
    const idxInRoute = this.routePath.indexOf(stationName);

    if (idxInRoute !== -1) {
      if (this.currentIndex < idxInRoute) this.direction = 'forward';
      else if (this.currentIndex > idxInRoute) this.direction = 'backward';

      this.currentIndex = idxInRoute;
      this.lastKnownStation = stationName;

      if (!this.visitedStations.includes(stationName)) {
        this.visitedStations.push(stationName);
      }
    }
  }

  /** Next expected station along the planned route */
  getNextStation() {
    const nextIdx = this.currentIndex + 1;
    return this.routePath[nextIdx] || null;
  }

  /** Remaining stations including current */
  getRemainingStations() {
    return this.routePath.slice(this.currentIndex);
  }

  /** How many stops until destination */
  stopsRemaining() {
    return this.routePath.length - 1 - this.currentIndex;
  }
}

/**
 * PredictionEngine - Core intelligence module
 *
 * Strategy (in order of confidence):
 * 1. If within planned route AND GPS match → confirm station
 * 2. If GPS is weak (underground) → use graph neighbors + direction
 * 3. Fallback → nearest station from raw GPS
 */
class PredictionEngine {
  constructor() {
    this.activeTripStates = new Map(); // tripId -> TripState
  }

  /**
   * Start tracking a new trip
   */
  startTrip(tripId, routePath) {
    const state = new TripState(routePath);
    state.updateStation(routePath[0]);
    this.activeTripStates.set(tripId, state);
    return state;
  }

  /**
   * Main prediction method — called every GPS update
   *
   * @param {string} tripId
   * @param {number} lat
   * @param {number} lng
   * @param {number} gpsAccuracy  - metres (higher = worse GPS)
   * @returns prediction object
   */
  predictCurrentStation(tripId, lat, lng, gpsAccuracy = 50) {
    const state = this.activeTripStates.get(tripId);
    if (!state) return { error: 'Trip not found' };

    // Dynamic match radius scales with accuracy (e.g. 300m + gpsAccuracy) but capped at 500m
    const STATION_MATCH_RADIUS = Math.min(500, Math.max(300, 300 + gpsAccuracy));

    // Get 5 nearest candidates globally
    const nearestCandidates = findNNearestStations(lat, lng, 5);
    if (nearestCandidates.length === 0) {
      return { error: 'No stations near user' };
    }

    let predictedStation = null;
    let confidence = gpsAccuracy <= 100 ? 'high' : 'medium';
    let method = 'in-transit';

    // 1. Check if user has arrived at the NEXT station or any FUTURE station along the planned route
    const remainingStations = state.routePath.slice(state.currentIndex + 1);
    for (const stationName of remainingStations) {
      const candidate = nearestCandidates.find((c) => c.station.name === stationName);
      if (candidate && candidate.distanceMeters <= STATION_MATCH_RADIUS) {
        predictedStation = stationName;
        method = 'gps+route';
        break; // Advanced to the closest matching future station
      }
    }

    // 2. If not at a future station, check if user is still close to the CURRENT station
    if (!predictedStation) {
      const currentStationName = state.routePath[state.currentIndex];
      const candidate = nearestCandidates.find((c) => c.station.name === currentStationName);
      if (candidate && candidate.distanceMeters <= STATION_MATCH_RADIUS) {
        predictedStation = currentStationName;
        method = 'gps+route';
      }
    }

    // 3. Check for Off-Route: If the closest station globally is NOT on the planned route, and user is close to it
    if (!predictedStation) {
      const closestGlobal = nearestCandidates[0];
      const isGlobalOnRoute = state.routePath.includes(closestGlobal.station.name);
      if (!isGlobalOnRoute && closestGlobal.distanceMeters <= 300) {
        predictedStation = closestGlobal.station.name;
        method = 'off-route';
      }
    }

    // 4. Fallback: If not close to any station, the user is IN-TRANSIT between the current station and the next
    if (!predictedStation) {
      predictedStation = state.lastKnownStation || state.routePath[0];
      method = 'in-transit';
    }

    // Update active trip state index if we found a valid route station
    if (method !== 'off-route' && method !== 'in-transit') {
      state.updateStation(predictedStation);
    }

    const nextStation = state.getNextStation();
    const stopsRemaining = state.stopsRemaining();
    
    // Ensure we trigger alerts for 2 stops, 1 stop, AND 0 stops remaining
    const shouldAlert = stopsRemaining <= 2;

    const isOffRoute = method === 'off-route' || state.routePath.indexOf(predictedStation) === -1;
    const isWrongDirection = state.direction === 'backward';
    let warningMessage = '';

    if (isOffRoute) {
      warningMessage = 'You have gone off-route! Tap Recalculate to get a new route from your current location.';
    } else if (isWrongDirection) {
      warningMessage = 'Warning: You are traveling in the wrong direction! Please check your train direction.';
    }

    return {
      currentStation: predictedStation,
      nextStation,
      stopsRemaining,
      currentIndex: state.currentIndex,
      shouldAlert,
      confidence,
      method,
      visitedStations: state.visitedStations,
      isOffRoute,
      isWrongDirection,
      warningMessage,
    };
  }

  /**
   * Stations around current position in the route (context window)
   */
  _getRouteContext(state) {
    const idx = state.currentIndex;
    const start = Math.max(0, idx - 1);
    const end = Math.min(state.routePath.length - 1, idx + 2);
    return state.routePath.slice(start, end + 1);
  }

  /**
   * Graph-based prediction using direction + neighbors
   */
  _graphPredict(state, nearestCandidates) {
    if (!state.lastKnownStation) return null;

    const graphNeighbors = metroGraph.getNeighbors(state.lastKnownStation);
    const nextInRoute = state.getNextStation();

    // Prefer the next station in the route if it's also a graph neighbor
    if (nextInRoute && graphNeighbors.includes(nextInRoute)) {
      // Check if any of the nearest GPS candidates match
      const candidateNames = nearestCandidates.map((c) => c.station.name);
      if (candidateNames.includes(nextInRoute)) {
        return nextInRoute;
      }
      // GPS underground but route says next → predict next
      return nextInRoute;
    }

    return state.lastKnownStation; // stay at last known
  }

  /**
   * End a trip and clean up
   */
  endTrip(tripId) {
    const state = this.activeTripStates.get(tripId);
    this.activeTripStates.delete(tripId);
    return state ? state.visitedStations : [];
  }

  /**
   * Update active trip route dynamically during recalculation
   */
  updateTripRoute(tripId, newRoutePath) {
    const state = this.activeTripStates.get(tripId);
    if (!state) return { error: 'Trip state not found' };

    state.routePath = newRoutePath;
    state.currentIndex = 0;
    state.direction = 'forward';
    
    state.lastKnownStation = newRoutePath[0];
    if (!state.visitedStations.includes(newRoutePath[0])) {
      state.visitedStations.push(newRoutePath[0]);
    }
    
    return state;
  }

  getState(tripId) {
    return this.activeTripStates.get(tripId) || null;
  }
}

const predictionEngine = new PredictionEngine();
module.exports = { predictionEngine, TripState };
