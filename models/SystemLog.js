// models/SystemLog.js
// Audit log for all significant system events.
// Records are append-only — never deleted during normal operation.

const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema(
  {
    event_type: {
      type:     String,
      required: true,
      enum: [
        // ── Authentication ───────────────────────────────────────
        'LOGIN_SUCCESS',          // staff member logged in
        'LOGIN_FAILURE',          // wrong password / unknown username
        'LOGOUT',                 // explicit logout
        'SESSION_RESTORED',       // page refresh — session restored from localStorage
        'SESSION_INVALIDATED',    // admin forced logout of all users (sessionVersion bump)
        'PASSWORD_CHANGED',       // staff changed their password

        // ── Booking ──────────────────────────────────────────────
        'SEAT_BOOKED',            // staff successfully booked a seat
        'SEAT_RELEASED',          // staff released a seat (switching)
        'SEAT_BOOKING_REJECTED',  // booking rejected for any reason
        'EARLY_BOOKING_ATTEMPT',  // booking attempted before the open window
        'DUPLICATE_BOOKING_ATTEMPT', // staff already has a seat today

        // ── Reservations ─────────────────────────────────────────
        'RESERVATION_CREATED',    // admin created a permanent/temporary reservation
        'RESERVATION_REMOVED',    // admin removed a reservation
        'RESERVATION_EXPIRED',    // temporary reservation expired automatically

        // ── Admin actions ────────────────────────────────────────
        'SETTINGS_UPDATED',       // booking window / total seats changed
        'BOOKINGS_RESET',         // admin reset today's bookings
        'HISTORY_CLEARED',        // admin cleared all history
        'STAFF_ADDED',            // new staff member created
        'STAFF_UPDATED',          // staff member edited
        'STAFF_REMOVED'           // staff member deleted
      ]
    },

    // Human-readable description of the event
    message: {
      type:    String,
      default: ''
    },

    // Structured event metadata (username, seat number, IP address, etc.)
    details: {
      type:    mongoose.Schema.Types.Mixed,
      default: {}
    },

    // The staff_id (username) of whoever triggered the event, if known
    actor: {
      type:    String,
      default: ''
    },

    // Request IP address (best-effort; proxied environments may show load-balancer IP)
    ip: {
      type:    String,
      default: ''
    },

    created_at: {
      type:    Date,
      default: Date.now,
      index:   true
    }
  },
  {
    // Disable automatic createdAt / updatedAt — we manage created_at ourselves
    timestamps: false
  }
);

// Index for efficient log queries
systemLogSchema.index({ event_type: 1, created_at: -1 });
systemLogSchema.index({ actor: 1,     created_at: -1 });

systemLogSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    delete ret.__v;
    return ret;
  }
});

/**
 * Convenience static — fire-and-forget log creation that never throws.
 * Always use this inside request handlers so a log failure never crashes
 * the actual API response.
 *
 * @param {string} event_type
 * @param {string} message
 * @param {object} details   — arbitrary metadata
 * @param {string} actor     — staff username/id
 * @param {string} ip        — client IP
 */
systemLogSchema.statics.record = function (event_type, message = '', details = {}, actor = '', ip = '') {
  return this.create({ event_type, message, details, actor, ip }).catch(err => {
    console.error('[SystemLog] Failed to write log entry:', err.message);
  });
};

module.exports = mongoose.model('SystemLog', systemLogSchema);
