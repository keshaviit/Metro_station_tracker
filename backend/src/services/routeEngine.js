const stations = require('../../data/stations.json');

/**
 * MetroGraph - Core routing intelligence
 * Converts station JSON into an adjacency-list graph
 * and provides BFS-based shortest path algorithm
 */
class MetroGraph {
  constructor() {
    this.graph = new Map();      // adjacency list: stationName -> [neighborNames]
    this.stationMap = new Map(); // stationName -> full station object
    this.buildGraph();
  }

  buildGraph() {
    stations.forEach((station) => {
      this.stationMap.set(station.name, station);
      this.graph.set(station.name, station.connectedStations || []);
    });
  }

  /**
   * BFS Shortest Path Algorithm
   * Returns path, interchanges, and estimated time
   */
  findShortestPath(sourceName, destName) {
    if (!this.graph.has(sourceName)) {
      return { error: `Source station "${sourceName}" not found` };
    }
    if (!this.graph.has(destName)) {
      return { error: `Destination station "${destName}" not found` };
    }
    if (sourceName === destName) {
      return {
        path: [sourceName],
        totalStations: 1,
        interchanges: [],
        estimatedTime: 0,
        distance: 0,
      };
    }

    const queue = [[sourceName]];
    const visited = new Set([sourceName]);

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const currentStation = currentPath[currentPath.length - 1];
      const neighbors = this.graph.get(currentStation) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const newPath = [...currentPath, neighbor];

          if (neighbor === destName) {
            return this._buildResult(newPath);
          }

          visited.add(neighbor);
          queue.push(newPath);
        }
      }
    }

    return { error: `No route found from "${sourceName}" to "${destName}"` };
  }

  /**
   * Build rich result from raw path array
   */
  _buildResult(path) {
    const interchanges = [];
    let prevLine = null;

    path.forEach((stationName) => {
      const station = this.stationMap.get(stationName);
      if (station) {
        if (prevLine && station.line !== prevLine && station.interchange) {
          interchanges.push(stationName);
        }
        prevLine = station.line;
      }
    });

    // ~2.5 min per station + 3 min per interchange
    const estimatedTime = (path.length - 1) * 2.5 + interchanges.length * 3;

    return {
      path,
      totalStations: path.length,
      interchanges,
      estimatedTime: Math.round(estimatedTime),
      stationDetails: path.map((name) => this.stationMap.get(name)).filter(Boolean),
    };
  }

  /**
   * Get all station names for autocomplete
   */
  getAllStationNames() {
    return [...this.stationMap.keys()];
  }

  /**
   * Get a station object by name
   */
  getStation(name) {
    return this.stationMap.get(name) || null;
  }

  /**
   * Get all stations (full objects)
   */
  getAllStations() {
    return [...this.stationMap.values()];
  }

  /**
   * Get neighbors of a station (for prediction engine)
   */
  getNeighbors(stationName) {
    return this.graph.get(stationName) || [];
  }
}

// Singleton instance
const metroGraph = new MetroGraph();
module.exports = metroGraph;
