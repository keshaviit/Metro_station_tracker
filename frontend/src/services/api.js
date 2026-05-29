import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || window.location.origin) + '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor to attach authentication token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('metro_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
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
export const authAPI = {
  register:    (body) => api.post('/auth/register', body),
  verifyOtp:   (body) => api.post('/auth/verify-otp', body),
  resendOtp:   (body) => api.post('/auth/resend-otp', body),
  login:       (body) => api.post('/auth/login', body),
  googleLogin: (body) => api.post('/auth/google', body),
  getMe:       ()     => api.get('/auth/me'),
};

export const metroAPI = {
  getAllStations:    ()           => api.get('/stations'),
  getStationNames:  ()           => api.get('/stations/names'),
  getNearestStation:(lat, lng)   => api.get('/stations/nearest', { params: { lat, lng } }),
  getRoute:         (source, destination) => api.get('/stations/route', { params: { source, destination } }),
  startTrip:        (body)       => api.post('/trips/start', body),
  updateLocation:   (body)       => api.post('/trips/update-location', body),
  endTrip:          (tripId)     => api.post(`/trips/${tripId}/end`),
  recalculateTrip:  (tripId, body) => api.post(`/trips/${tripId}/recalculate`, body),
  getTripHistory:   ()           => api.get('/trips/history'),
};

export default api;
