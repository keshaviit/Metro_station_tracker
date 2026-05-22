const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    savedRoutes: [
      {
        source: String,
        destination: String,
        label: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tripHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trip' }],
    preferences: {
      theme: { type: String, default: 'dark' },
      alertBeforeStops: { type: Number, default: 2 },
      notificationsEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
