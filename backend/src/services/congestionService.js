/**
 * Simulated Metro Station Congestion / crowd density service.
 * Simulates peak hour transit volumes dynamically based on the current system time.
 */

function getCongestionScore(stationName) {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeVal = hours + minutes / 60;

  // Peak Hour windows: 8:30 AM - 10:30 AM and 5:30 PM - 8:00 PM
  const isPeak = (timeVal >= 8.5 && timeVal <= 10.5) || (timeVal >= 17.5 && timeVal <= 20.0);

  // Major busy interchange stations
  const busyHubs = [
    "Rajiv Chowk",
    "Kashmere Gate",
    "Noida Sector 52",
    "Hauz Khas",
    "New Delhi",
    "Yamuna Bank",
    "Central Secretariat",
    "Kirti Nagar",
    "Inderlok",
    "Welcome",
    "Azadpur",
    "Netaji Subhash Place",
    "Botanical Garden",
    "Mayur Vihar 1",
    "Lajpat Nagar",
    "Dwarka Sector 21"
  ];

  if (busyHubs.includes(stationName)) {
    return isPeak ? 4.8 : 2.5; // High busy during peak, moderate busy otherwise
  }

  // General stations
  return isPeak ? 2.0 : 1.2; // Minor busy during peak, quiet otherwise
}

function getCongestionLabel(score) {
  if (score >= 4.0) return 'Extremely Busy';
  if (score >= 2.2) return 'Moderate';
  return 'Quiet';
}

function getCongestionColorClass(score) {
  if (score >= 4.0) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (score >= 2.2) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-green-400 bg-green-500/10 border-green-500/20';
}

module.exports = {
  getCongestionScore,
  getCongestionLabel,
  getCongestionColorClass
};
