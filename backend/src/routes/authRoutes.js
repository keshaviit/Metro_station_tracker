const express = require('express');
const router = express.Router();
const {
  register,
  verifyOtp,
  resendOtp,
  login,
  googleLogin,
  getMe,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// ── Public Routes ─────────────────────────────────────────────────────────────

// Sign up with name, email, password (sends OTP)
router.post('/register', register);

// Verify OTP to complete registration
router.post('/verify-otp', verifyOtp);

// Resend expired/missed OTP
router.post('/resend-otp', resendOtp);

// Standard Login with email & password
router.post('/login', login);

// Google Sign-In verification endpoint
router.post('/google', googleLogin);

// ── Protected Routes ──────────────────────────────────────────────────────────

// Retrieve current logged in user details
router.get('/me', requireAuth, getMe);

module.exports = router;
