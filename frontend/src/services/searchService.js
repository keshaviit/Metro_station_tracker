/**
 * Fuzzy search for metro stations with typo tolerance, prefix/substring ranking, and popular stations boost.
 *
 * @param {Array<string|Object>} stations - List of station names or station objects
 * @param {string} query - The search query
 * @returns {Array} List of matching stations sorted by score
 */
export function searchStations(stations, query) {
  if (!query || !query.trim()) return [];

  const POPULAR_STATIONS = [
    "Rajiv Chowk",
    "Kashmere Gate",
    "Noida Sector 52",
    "Hauz Khas",
    "New Delhi",
    "Yamuna Bank",
    "Dwarka Sector 21",
    "Noida Electronic City",
    "Samaypur Badli",
    "Vishwavidyalaya",
    "Central Secretariat"
  ];

  const cleanQuery = query.toLowerCase().trim();
  const queryWords = cleanQuery.split(/[\s()\-]+/);

  const getLevenshteinDistance = (a, b) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  };

  const results = stations.map(station => {
    const stationName = typeof station === 'string' ? station : station.name;
    const cleanStation = stationName.toLowerCase();
    const stationWords = cleanStation.split(/[\s()\-]+/);

    let score = 0;

    // 1. Exact match
    if (cleanStation === cleanQuery) {
      score += 1000;
    }
    // 2. Prefix match on full name
    else if (cleanStation.startsWith(cleanQuery)) {
      score += 800 - (cleanStation.length - cleanQuery.length);
    }
    // 3. Substring match
    else if (cleanStation.includes(cleanQuery)) {
      const index = cleanStation.indexOf(cleanQuery);
      score += 500 - index - (cleanStation.length - cleanQuery.length);
    }

    // 4. Word-by-word matches
    let wordMatches = 0;
    queryWords.forEach(qWord => {
      if (!qWord) return;

      stationWords.forEach(sWord => {
        if (!sWord) return;

        // Exact word match
        if (sWord === qWord) {
          score += 150;
          wordMatches++;
        }
        // Word prefix match
        else if (sWord.startsWith(qWord)) {
          score += 100;
          wordMatches++;
        }
        // Fuzzy word match (only for words of length >= 3)
        else if (qWord.length >= 3 && sWord.length >= 3) {
          const dist = getLevenshteinDistance(qWord, sWord);
          if (dist <= 2) {
            score += 50 - dist * 15;
            wordMatches++;
          }
        }
      });
    });

    // Boost for matching multiple words
    score += wordMatches * 50;

    // 5. Popular station boost
    if (POPULAR_STATIONS.some(p => p.toLowerCase() === cleanStation)) {
      score += 150;
    }

    return { station, score };
  });

  // Filter out zero/very low scores and sort by score descending
  return results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.station);
}
