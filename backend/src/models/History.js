const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, required: true },
    destination: { type: String, required: true },
    pathTaken: [{ type: String }],
    distanceKm: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('History', historySchema);
