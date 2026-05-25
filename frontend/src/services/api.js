import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

// ── API Functions ─────────────────────────────────────────────────────────────
export const metroAPI = {
  getAllStations:    ()           => api.get('/stations'),
  getStationNames:  ()           => api.get('/stations/names'),
  getNearestStation:(lat, lng)   => api.get('/stations/nearest', { params: { lat, lng } }),
  getRoute:         (source, destination) => api.get('/stations/route', { params: { source, destination } }),
  startTrip:        (body)       => api.post('/trips/start', body),
  updateLocation:   (body)       => api.post('/trips/update-location', body),
  endTrip:          (tripId)     => api.post(`/trips/${tripId}/end`),
  recalculateTrip:  (tripId, body) => api.post(`/trips/${tripId}/recalculate`, body),
};

export default api;
