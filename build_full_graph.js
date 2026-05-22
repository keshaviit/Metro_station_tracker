const fs = require('fs');

const dataPath = '/Users/keshavgoyal/Downloads/delhi_metro_stops.json';
const outPath = '/Users/keshavgoyal/Desktop/Metro_Stattion_tracker/backend/data/stations.json';

const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const stops = rawData.stops;

const stopMap = new Map();
stops.forEach(s => stopMap.set(s.stop_id, s));

const getName = (id) => stopMap.get(id) ? stopMap.get(id).stop_name : null;
const getLat = (id) => stopMap.get(id) ? stopMap.get(id).stop_lat : 0;
const getLng = (id) => stopMap.get(id) ? stopMap.get(id).stop_lon : 0;

// EXACT TOPOLOGICAL GRAPH ARRAYS FOR EVERY LINE IN DELHI METRO
const lines = [
  { name: 'Red', nodes: [225, 226, 227, 228, 229, 230, 231, 232, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] },
  { name: 'Green', nodes: [35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 196, 197, 198, 199, 200, 201, 202] },
  { name: 'Yellow', nodes: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 8, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71] },
  { name: 'Blue Branch', nodes: [72, 73, 74, 75, 76, 77, 78, 89] },
  { name: 'Blue', nodes: [238, 237, 236, 235, 234, 233, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 50, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121] },
  { name: 'Violet', nodes: [160, 159, 158, 122, 92, 123, 52, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 219, 220] },
  { name: 'Rapid', nodes: [168, 169, 170, 171, 172, 68, 148, 149, 150, 151, 152, 153] },
  { name: 'Airport', nodes: [49, 157, 156, 155, 154, 191, 121] },
  { name: 'Magenta', nodes: [81, 161, 162, 163, 164, 165, 166, 167, 131, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 108] },
  { name: 'Pink', nodes: [173, 41, 174, 175, 176, 33, 177, 103, 178, 179, 180, 181, 203, 204, 56, 205, 206, 127, 221, 222, 223, 224, 87, 207, 208, 209, 210, 74, 211, 212, 213, 5, 214, 215, 216, 217, 218] },
  { name: 'Aqua', nodes: [500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520] },
  { name: 'Grey', nodes: [113, 239, 240, 241] }
];

const additionalConnections = [
  [13, 34], // Inderlok (Red) to Ashok Park Main (Green)
  [100, 34], // Kirti Nagar (Blue) to Ashok Park Main (Green)
  [500, 234], // Noida Sec 51 (Aqua) to Noida Sec 52 (Blue)
  [16, 175], // Netaji Subhash Place (Red to Pink)
  [59, 185] // Hauz Khas (Yellow to Magenta)
];

const finalStations = new Map();

lines.forEach(lineDef => {
  for (let i = 0; i < lineDef.nodes.length; i++) {
    const id = lineDef.nodes[i];
    if (!stopMap.has(id)) continue;
    
    if (!finalStations.has(id)) {
      finalStations.set(id, {
        id: getName(id).toLowerCase().replace(/\s+/g, '-'),
        name: getName(id),
        line: lineDef.name,
        lat: getLat(id),
        lng: getLng(id),
        interchange: false,
        connectedStations: new Set()
      });
    }

    const st = finalStations.get(id);
    if (i > 0 && stopMap.has(lineDef.nodes[i-1])) st.connectedStations.add(getName(lineDef.nodes[i-1]));
    if (i < lineDef.nodes.length - 1 && stopMap.has(lineDef.nodes[i+1])) st.connectedStations.add(getName(lineDef.nodes[i+1]));
  }
});

additionalConnections.forEach(([id1, id2]) => {
  if (finalStations.has(id1) && finalStations.has(id2)) {
    finalStations.get(id1).connectedStations.add(getName(id2));
    finalStations.get(id2).connectedStations.add(getName(id1));
  }
});

const outputArray = Array.from(finalStations.values()).map(st => {
  const connectedArr = Array.from(st.connectedStations);
  return {
    id: st.id,
    name: st.name,
    line: st.line,
    lat: st.lat,
    lng: st.lng,
    interchange: connectedArr.length > 2,
    connectedStations: connectedArr
  };
});

fs.writeFileSync(outPath, JSON.stringify(outputArray, null, 2));
console.log(`Successfully built graph with ${outputArray.length} stations!`);
