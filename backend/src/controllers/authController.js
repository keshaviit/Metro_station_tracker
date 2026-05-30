const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const logger = require('../config/logger');
// Note: Email sending removed from this backend.
// OTP generation + email is handled by the Vercel serverless function (/api/send-otp)
// which runs on Vercel (no SMTP port restrictions). This backend only verifies OTPs.

// Initialize Google OAuth2 client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Generate a JWT session token for a verified user
 */
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'fallback_secret_for_local_dev',
    { expiresIn: '30d' }
  );
};

/**
 * @desc    Register or Log In a user (Passwordless OTP / Password-based fallback)
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { email } = req.body;
    let { name, password } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email address' });
    }

    // Default name if not provided
    if (!name) {
      name = email.split('@')[0];
    }

    // If password is not provided, generate a secure random one for passwordless flow
    const isPasswordless = !password;
    if (isPasswordless) {
      password = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      // If user exists and is unverified (or passwordless), return userId so Vercel can send OTP
      if (isPasswordless || !userExists.isVerified) {
        // Maintain passwordless provider type
        if (isPasswordless) {
          userExists.authProvider = 'email';
        }
        await userExists.save();

        logger.info(`OTP send requested for existing user: ${email}`);
        return res.status(200).json({
          success: true,
          message: 'Verification code will be sent to your email.',
          userId: userExists._id,
          name: userExists.name,
        });
      }

      // Already verified with password — reject duplicate registration
      return res.status(400).json({ success: false, message: 'Email already registered. Please log in instead.' });
    }

    // Create new unverified user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      authProvider: 'email',
      isVerified: false,
      // OTP is NOT generated here — Vercel serverless function will generate + send it
    });

    logger.info(`New user registered (unverified, OTP to be sent by Vercel): ${email}`);
    res.status(201).json({
      success: true,
      message: 'Account created. Verification code will be sent to your email.',
      userId: newUser._id,
      name: newUser.name,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP code for email sign up
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
const verifyOtp = async (req, res, next) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'User ID and OTP code are required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Email already verified. Please log in.' });
    }

    // Check if OTP is expired
    if (Date.now() > user.otpExpiresAt) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    // Check if OTP matches
    const isMatch = await bcrypt.compare(otp, user.otp);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
    }

    // Mark as verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    // Create session JWT token
    const token = generateToken(user._id);

    logger.info(`User email verified successfully: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! You are now logged in.',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        authProvider: user.authProvider,
        savedRoutes: user.savedRoutes,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend OTP code
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
const resendOtp = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Account is already verified.' });
    }

    const otp = generateOtp();
    const otpSalt = await bcrypt.genSalt(10);
    user.otp = await bcrypt.hash(otp, otpSalt);
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();
    await sendOtpEmail(user.email, user.name, otp);

    logger.info(`OTP resent to ${user.email}`);
    res.status(200).json({
      success: true,
      message: 'A new 6-digit OTP code has been sent to your email.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Log in with email & password
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });

    if (!user || user.authProvider !== 'email') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isVerified) {
      // Return userId so frontend can call Vercel /api/send-otp to send OTP
      return res.status(403).json({
        success: false,
        message: 'Your account is not verified yet. A new OTP will be sent to your email.',
        needsVerification: true,
        userId: user._id,
        name: user.name,
      });
    }

    // Generate token
    const token = generateToken(user._id);

    logger.info(`User logged in successfully: ${email}`);

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        authProvider: user.authProvider,
        savedRoutes: user.savedRoutes,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Google Sign-In / Sign-Up
 * @route   POST /api/auth/google
 * @access  Public
 */
const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: 'Google ID Token is required' });
    }

    let payload;
    try {
      // Verify ID token with Google APIs
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      logger.error(`Google token verification failed: ${err.message}`);
      return res.status(400).json({ success: false, message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user already exists by googleId
    let user = await User.findOne({ googleId });

    if (!user) {
      // Try to find by email (if they registered with email/password previously)
      user = await User.findOne({ email });

      if (user) {
        // Link Google ID to existing email account and verify it
        user.googleId = googleId;
        user.picture = picture || user.picture;
        user.isVerified = true; // Auto-verify email
        await user.save();
        logger.info(`Google ID linked to existing email account: ${email}`);
      } else {
        // Create new user via Google Sign-In
        user = await User.create({
          name,
          email,
          googleId,
          picture,
          authProvider: 'google',
          isVerified: true, // Google accounts are pre-verified
        });
        logger.info(`New user registered via Google: ${email}`);
      }
    } else {
      // Update Google profile picture if it changed
      if (picture && user.picture !== picture) {
        user.picture = picture;
        await user.save();
      }
      logger.info(`User logged in via Google: ${email}`);
    }

    // Generate session token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        authProvider: user.authProvider,
        savedRoutes: user.savedRoutes,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current user profile (JWT protected)
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    // req.user is populated by requireAuth middleware
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  googleLogin,
  getMe,
};
