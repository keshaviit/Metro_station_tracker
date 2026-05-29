const mongoose = require('mongoose');
const logger = require('./logger');

// Cache the connection promise so Vercel serverless reuses it across warm invocations
let cached = global._mongooseConnection;

const connectDB = async () => {
  // If already connected or connecting, reuse
  if (cached) {
    return cached;
  }

  // If mongoose is already connected (e.g. readyState === 1), skip
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/metro_tracker';
    const conn = await mongoose.connect(uri);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
    cached = conn;
    global._mongooseConnection = cached;
    return conn;
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    // Don't crash app — allow offline mode with in-memory data
  }
};

module.exports = connectDB;

