/**
 * MetroGraph - Core Offline Routing Intelligence
 * Ports BFS and Dijkstra route-solving logic to run directly inside the browser.
 */
class MetroGraph {
  constructor(stationsArray) {
    this.graph = new Map();      // adjacency list: stationName -> [neighborNames]
    this.stationMap = new Map(); // stationName -> full station object
    this.buildGraph(stationsArray || []);
  }

  buildGraph(stations) {
    stations.forEach((station) => {
      this.stationMap.set(station.name, station);
      this.graph.set(station.name, station.connectedStations || []);
    });
  }

  _getExactStationName(name) {
    if (!name) return null;
    const trimmed = name.trim();
    if (this.graph.has(trimmed)) return trimmed;

    const lowerName = trimmed.toLowerCase();
    
    // 1. Try case-insensitive matching
    for (const key of this.graph.keys()) {
      if (key.toLowerCase() === lowerName) {
        return key;
      }
    }

    // 2. Try substring matching
    const substringCandidates = [];
    for (const key of this.graph.keys()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes(lowerName)) {
        substringCandidates.push(key);
      }
    }
    if (substringCandidates.length > 0) {
      substringCandidates.sort((a, b) => a.length - b.length);
      return substringCandidates[0];
    }

    // 3. Try Levenshtein edit distance <= 3
    let bestMatch = null;
    let minDistance = Infinity;
    for (const key of this.graph.keys()) {
      const dist = this._getLevenshteinDistance(lowerName, key.toLowerCase());
      if (dist < minDistance && dist <= 3) {
        minDistance = dist;
        bestMatch = key;
      }
    }

    return bestMatch;
  }

  _getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  _getHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Radius of earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * BFS Shortest Path (Fewest Stations)
   */
  findShortestPath(sourceInput, destInput) {
    const sourceName = this._getExactStationName(sourceInput);
    const destName = this._getExactStationName(destInput);

    if (!sourceName) return { error: `Source station "${sourceInput}" not found` };
    if (!destName) return { error: `Destination station "${destInput}" not found` };
    if (sourceName === destName) {
      return { path: [sourceName], totalStations: 1, interchanges: [], estimatedTime: 0, distanceKm: 0 };
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
   * Dijkstra Minimum Interchanges Path (Fewest train transfers)
   */
  findMinInterchangesPath(sourceInput, destInput) {
    const sourceName = this._getExactStationName(sourceInput);
    const destName = this._getExactStationName(destInput);

    if (!sourceName) return { error: `Source station "${sourceInput}" not found` };
    if (!destName) return { error: `Destination station "${destInput}" not found` };
    if (sourceName === destName) {
      return { path: [sourceName], totalStations: 1, interchanges: [], estimatedTime: 0, distanceKm: 0 };
    }

    const pq = [];
    const startStation = this.stationMap.get(sourceName);
    pq.push({
      station: sourceName,
      line: startStation.line,
      cost: 0,
      path: [sourceName]
    });

    const visited = new Map();
    visited.set(`${sourceName}:${startStation.line}`, 0);

    let bestPath = null;
    let minCost = Infinity;

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const { station, line, cost, path } = pq.shift();

      if (station === destName) {
        if (cost < minCost) {
          minCost = cost;
          bestPath = path;
        }
        break;
      }

      if (cost > (visited.get(`${station}:${line}`) ?? Infinity)) continue;

      const neighbors = this.graph.get(station) || [];
      for (const neighborName of neighbors) {
        const neighbor = this.stationMap.get(neighborName);
        if (!neighbor) continue;

        let weight = 1;
        let nextLine = line;

        if (neighbor.line !== line) {
          weight = 1000; // Line switch penalty
          nextLine = neighbor.line;
        }

        const nextCost = cost + weight;
        const stateKey = `${neighborName}:${nextLine}`;

        if (nextCost < (visited.get(stateKey) ?? Infinity)) {
          visited.set(stateKey, nextCost);
          pq.push({
            station: neighborName,
            line: nextLine,
            cost: nextCost,
            path: [...path, neighborName]
          });
        }
      }
    }

    if (bestPath) return this._buildResult(bestPath);
    return { error: `No route found from "${sourceName}" to "${destName}"` };
  }

  /**
   * Dijkstra Shortest Distance Path (fewest meters)
   */
  findShortestDistancePath(sourceInput, destInput) {
    const sourceName = this._getExactStationName(sourceInput);
    const destName = this._getExactStationName(destInput);

    if (!sourceName) return { error: `Source station "${sourceInput}" not found` };
    if (!destName) return { error: `Destination station "${destInput}" not found` };
    if (sourceName === destName) {
      return { path: [sourceName], totalStations: 1, interchanges: [], estimatedTime: 0, distanceKm: 0 };
    }

    const pq = [];
    pq.push({ station: sourceName, cost: 0, path: [sourceName] });

    const visited = new Map();
    visited.set(sourceName, 0);

    let bestPath = null;
    let minCost = Infinity;

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const { station, cost, path } = pq.shift();

      if (station === destName) {
        if (cost < minCost) {
          minCost = cost;
          bestPath = path;
        }
        break;
      }

      if (cost > (visited.get(station) ?? Infinity)) continue;

      const neighbors = this.graph.get(station) || [];
      const currStation = this.stationMap.get(station);
      if (!currStation) continue;

      for (const neighborName of neighbors) {
        const neighbor = this.stationMap.get(neighborName);
        if (!neighbor) continue;

        const distance = (currStation.lat && currStation.lng && neighbor.lat && neighbor.lng)
          ? this._getHaversineDistance(currStation.lat, currStation.lng, neighbor.lat, neighbor.lng)
          : 2000; // 2km default

        const nextCost = cost + distance;

        if (nextCost < (visited.get(neighborName) ?? Infinity)) {
          visited.set(neighborName, nextCost);
          pq.push({
            station: neighborName,
            cost: nextCost,
            path: [...path, neighborName]
          });
        }
      }
    }

    if (bestPath) return this._buildResult(bestPath);
    return { error: `No route found from "${sourceName}" to "${destName}"` };
  }

  /**
   * Dijkstra Less Congested Path
   */
  findLessCongestedPath(sourceInput, destInput) {
    const sourceName = this._getExactStationName(sourceInput);
    const destName = this._getExactStationName(destInput);

    if (!sourceName) return { error: `Source station "${sourceInput}" not found` };
    if (!destName) return { error: `Destination station "${destInput}" not found` };
    if (sourceName === destName) {
      return { path: [sourceName], totalStations: 1, interchanges: [], estimatedTime: 0, distanceKm: 0 };
    }

    const pq = [];
    pq.push({ station: sourceName, cost: 0, path: [sourceName] });

    const visited = new Map();
    visited.set(sourceName, 0);

    let bestPath = null;
    let minCost = Infinity;

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const { station, cost, path } = pq.shift();

      if (station === destName) {
        if (cost < minCost) {
          minCost = cost;
          bestPath = path;
        }
        break;
      }

      if (cost > (visited.get(station) ?? Infinity)) continue;

      const neighbors = this.graph.get(station) || [];
      for (const neighborName of neighbors) {
        const neighbor = this.stationMap.get(neighborName);
        if (!neighbor) continue;

        // Offline congestion fallback: interchanges default to medium, others low
        const congestionScore = neighbor.interchange ? 2.5 : 1.0;
        const weight = 1 * congestionScore;
        const nextCost = cost + weight;

        if (nextCost < (visited.get(neighborName) ?? Infinity)) {
          visited.set(neighborName, nextCost);
          pq.push({
            station: neighborName,
            cost: nextCost,
            path: [...path, neighborName]
          });
        }
      }
    }

    if (bestPath) return this._buildResult(bestPath);
    return { error: `No route found from "${sourceName}" to "${destName}"` };
  }

  _buildResult(path) {
    const interchanges = [];
    let totalDistanceMeters = 0;
    
    for (let i = 0; i < path.length - 1; i++) {
      const stationA = this.stationMap.get(path[i]);
      const stationB = this.stationMap.get(path[i + 1]);
      if (stationA && stationB && stationA.lat && stationA.lng && stationB.lat && stationB.lng) {
        totalDistanceMeters += this._getHaversineDistance(stationA.lat, stationA.lng, stationB.lat, stationB.lng);
      }
    }

    for (let i = 1; i < path.length - 1; i++) {
      const prevStation = this.stationMap.get(path[i - 1]);
      const currStation = this.stationMap.get(path[i]);
      const nextStation = this.stationMap.get(path[i + 1]);
      if (prevStation && currStation && nextStation) {
        if (currStation.interchange && prevStation.line !== nextStation.line) {
          interchanges.push(currStation.name);
        }
      }
    }

    const estimatedTime = (path.length - 1) * 2.5 + interchanges.length * 4; // 4 min interchange penalty

    return {
      path,
      totalStations: path.length,
      interchanges,
      estimatedTime: Math.round(estimatedTime),
      distanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(2)),
      stationDetails: path.map((name) => {
        const s = this.stationMap.get(name);
        if (!s) return null;
        return {
          ...s,
          congestion: {
            score: s.interchange ? 2.5 : 1.0,
            label: s.interchange ? 'Medium' : 'Low',
            colorClass: s.interchange ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }
        };
      }).filter(Boolean),
    };
  }
}

export default MetroGraph;
