const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema(
  {
    tripId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, default: 'anonymous', index: true },
    source: { type: String, required: true },
    destination: { type: String, required: true },
    routePath: [{ type: String }],
    visitedStations: [{ type: String }],
    interchanges: [{ type: String }],
    estimatedTime: { type: Number },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Trip', tripSchema);
