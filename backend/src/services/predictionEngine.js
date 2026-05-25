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

    const GPS_WEAK_THRESHOLD = 100; // metres accuracy
    const STATION_MATCH_RADIUS = 300; // metres

    // Always get nearest candidates
    const nearestCandidates = findNNearestStations(lat, lng, 5);
    const [first] = nearestCandidates;

    let predictedStation = null;
    let confidence = 'low';
    let method = 'gps';

    // Strategy 1: Strong GPS — direct nearest station
    if (gpsAccuracy <= GPS_WEAK_THRESHOLD && first.distanceMeters <= STATION_MATCH_RADIUS) {
      const stationName = first.station.name;

      // Validate against planned route neighbours
      const routeNeighbors = this._getRouteContext(state);
      if (routeNeighbors.includes(stationName)) {
        state.updateStation(stationName);
        predictedStation = stationName;
        confidence = 'high';
        method = 'gps+route';
      } else {
        // GPS says different station — trust GPS but flag
        predictedStation = stationName;
        confidence = 'medium';
        method = 'gps';
      }
    }

    // Strategy 2: Weak GPS / underground — use graph prediction
    if (!predictedStation || gpsAccuracy > GPS_WEAK_THRESHOLD) {
      const graphPrediction = this._graphPredict(state, nearestCandidates);
      if (graphPrediction) {
        predictedStation = graphPrediction;
        confidence = 'medium';
        method = 'graph';
      }
    }

    // Fallback
    if (!predictedStation) {
      predictedStation = state.lastKnownStation || state.routePath[0];
      confidence = 'low';
      method = 'fallback';
    }

    // Update state with prediction
    if (method !== 'fallback') {
      state.updateStation(predictedStation);
    }

    const nextStation = state.getNextStation();
    const stopsRemaining = state.stopsRemaining();
    const shouldAlert = stopsRemaining <= 2 && stopsRemaining > 0;

    const isOffRoute = state.routePath.indexOf(predictedStation) === -1;
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
