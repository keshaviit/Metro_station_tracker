import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || window.location.origin) + '/api',
  timeout: 60000, // 60 seconds to allow Render free tier to wake up (cold start)
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
  login:       (body) => api.post('/auth/login', body),
  googleLogin: (body) => api.post('/auth/google', body),
  getMe:       ()     => api.get('/auth/me'),
};

// ── Vercel Serverless Function: OTP Email Sender ───────────────────────────
// Runs on Vercel (not Render) because Vercel allows Gmail SMTP, Render free tier does not.
// Calls /api/send-otp → frontend/api/send-otp.js
export const sendOtpViaVercel = async ({ userId, email, name }) => {
  const response = await fetch('/api/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email, name }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to send verification code');
  }
  return data;
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
