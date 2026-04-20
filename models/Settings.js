// models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    booking_start_time: { type: String, default: '16:50' },
    booking_end_time:   { type: String, default: '17:00' },
    display_time:       { type: String, default: '17:20' },
    total_seats:        { type: Number, default: 30, min: 1, max: 60 },

    // ── Force-logout pattern ─────────────────────────────────────────
    // Incrementing this number invalidates all active client sessions.
    // Every GET /api/seats returns the current value; the frontend
    // compares it against the value stored at login and calls doLogout()
    // on mismatch. No user, booking, or history data is ever deleted.
    session_version: { type: Number, default: 1 }
  },
  { timestamps: true }
);

// Ensure at most one settings document exists
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Map internal field names to API field names the frontend expects
settingsSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id             = ret._id.toString();
    ret.openTime       = ret.booking_start_time;
    ret.closeTime      = ret.booking_end_time;
    ret.resultsTime    = ret.display_time;
    ret.totalSeats     = ret.total_seats;
    ret.sessionVersion = ret.session_version;
    delete ret._id;
    delete ret.__v;
    delete ret.createdAt;
    delete ret.updatedAt;
    return ret;
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
