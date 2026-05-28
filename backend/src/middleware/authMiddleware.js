const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * Strict authentication middleware.
 * Verifies JWT session token and blocks access if invalid or missing.
 */
const requireAuth = async (req, res, next) => {
  let token;

  // Check Authorization header (Format: Bearer <JWT>)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_local_dev');

      // Get user from the token payload and attach to request
      req.user = await User.findById(decoded.id).select('-password -otp');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, user not found in database',
        });
      }

      if (!req.user.isVerified && req.user.authProvider === 'email') {
        return res.status(403).json({
          success: false,
          message: 'Account not verified. Please verify your email first.',
          needsVerification: true,
          userId: req.user._id,
        });
      }

      return next();
    } catch (error) {
      logger.error(`Auth Middleware Error: ${error.message}`);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, session token is invalid or expired',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
    });
  }
};

/**
 * Optional authentication middleware.
 * Attempts to parse JWT session token and attach user if present,
 * but NEVER blocks the request. Useful for endpoints that work for guest users too.
 */
const optionalAuth = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_local_dev');
      req.user = await User.findById(decoded.id).select('-password -otp');
    } catch (error) {
      // Fail silently for optional auth
      logger.debug(`Optional Auth parse skipped: ${error.message}`);
    }
  }
  next();
};

module.exports = {
  requireAuth,
  optionalAuth,
};
