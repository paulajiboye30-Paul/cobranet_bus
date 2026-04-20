// api/seats.js
// GET /api/seats       — returns bookings + reservations + settings + sessionVersion
// GET /api/serverTime  — returns authoritative server time (NTP-synced system clock)

const express      = require('express');
const router       = express.Router();
const Reservation  = require('../models/TemporaryReservation');
const DailyBooking = require('../models/DailyBooking');
const Settings     = require('../models/Settings');

// ── Africa/Lagos timezone helpers (WAT = UTC+1, no DST) ──────────────

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1

/** Returns a Date object representing "now" in Africa/Lagos wall-clock time */
function lagosNow () {
  return new Date(Date.now() + LAGOS_OFFSET_MS);
}

/** Returns the day-of-week in Lagos time (0 = Sunday … 6 = Saturday) */
function lagosDay () {
  return lagosNow().getUTCDay();
}

/** Returns minutes-since-midnight in Lagos time */
function lagosMinuteOfDay () {
  const t = lagosNow();
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** Parse "HH:MM" → total minutes */
function timeStrToMinutes (str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// ── GET /api/serverTime ───────────────────────────────────────────────
// Returns the authoritative server clock.
// The frontend uses this to sync countdown display; the booking window is
// enforced on the server regardless.
router.get('/serverTime', (req, res) => {
  const utcNow   = new Date();
  const lagosNow = new Date(utcNow.getTime() + LAGOS_OFFSET_MS);

  return res.json({
    success:        true,
    utcTime:        utcNow.toISOString(),
    lagosTime:      lagosNow.toISOString().replace('Z', '+01:00'),
    lagosHHMM:      lagosNow.toISOString().slice(11, 16), // "HH:MM"
    lagosMinuteOfDay: lagosMinuteOfDay(),
    dayOfWeek:      lagosDay(),                           // 0 Sun … 6 Sat
    isWeekend:      lagosDay() === 0 || lagosDay() === 6
  });
});

// ── Helpers ───────────────────────────────────────────────────────────

function getTodayRange () {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

async function expireTemporaryReservations () {
  try {
    const result = await Reservation.updateMany(
      { reservation_type: 'temporary', expires_at: { $lt: new Date() }, status: 'active' },
      { $set: { status: 'expired' } }
    );
    if (result.modifiedCount) {
      console.log(`[seats] Expired ${result.modifiedCount} temporary reservation(s)`);
    }
  } catch (err) {
    console.error('expireTemporaryReservations error:', err.message);
  }
}

async function validateOneSeatPerStaff () {
  try {
    const { start, end } = getTodayRange();
    const duplicates = await DailyBooking.aggregate([
      { $match: { booking_date: { $gte: start, $lt: end } } },
      { $group: { _id: '$staffId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    for (const group of duplicates) {
      const bookings = await DailyBooking
        .find({ _id: { $in: group.ids } })
        .sort({ booking_time: 1 });

      const toDelete = bookings.slice(1).map(b => b._id);
      if (toDelete.length) {
        await DailyBooking.deleteMany({ _id: { $in: toDelete } });
        console.log(`[seats] Removed ${toDelete.length} extra booking(s) for ${group._id}`);
      }
    }
  } catch (err) {
    console.error('validateOneSeatPerStaff error:', err.message);
  }
}

// ── GET /api/seats ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // STEP 1 — Expire overdue temporary reservations
    await expireTemporaryReservations();

    // STEP 2 — Enforce one seat per staff
    await validateOneSeatPerStaff();

    // STEP 3a — Today's staff bookings
    const { start: todayStart, end: todayEnd } = getTodayRange();
    const todayStr = todayStart.toISOString().split('T')[0];

    const bookingRows = await DailyBooking
      .find({ booking_date: { $gte: todayStart, $lt: todayEnd } })
      .populate('staff_id', 'staff_name staffId department');

    // ── BUG FIX: name fallback ────────────────────────────────────────
    // When staff_id populate returns null (staff record deleted or ref broken),
    // the original code showed an empty string.
    // Fix: fall back to row.staffId (the denormalized username always present).
    const bookings = {};
    bookingRows.forEach(row => {
      const staffDoc = row.staff_id;
      bookings[String(row.seat_number)] = {
        username:   staffDoc ? staffDoc.staffId    : row.staffId,
        name:       staffDoc ? staffDoc.staff_name : row.staffId,  // ← FIXED
        department: staffDoc ? staffDoc.department : '',
        time:       row.booking_time,
        date:       todayStr
      };
    });

    // STEP 3b — Active reservations (permanent + non-expired temporary)
    const now = new Date();
    const resRows = await Reservation.find({
      status: 'active',
      $or: [
        { reservation_type: 'permanent' },
        { reservation_type: 'temporary', expires_at: { $gt: now } }
      ]
    });

    const reservations = resRows.map(r => ({
      _id:         r._id.toString(),
      seat:        r.seat_number,
      label:       r.label,
      type:        r.reservation_type,
      status:      r.status,
      expiresDate: r.expires_at ? r.expires_at.toISOString().split('T')[0] : null,
      expiresAt:   r.expires_at ? r.expires_at.toISOString() : null,
      reservedAt:  r.reserved_at.toISOString()
    }));

    // STEP 3c — Settings (includes sessionVersion for force-logout detection)
    const settingsDoc = await Settings.getSettings();
    const settings = {
      openTime:       settingsDoc.booking_start_time,
      closeTime:      settingsDoc.booking_end_time,
      resultsTime:    settingsDoc.display_time,
      totalSeats:     settingsDoc.total_seats
    };

    return res.json({
      success:        true,
      bookings,
      reservations,
      settings,
      // ── Session version for force-logout ─────────────────────────────
      // Frontend stores this at login and compares on every poll.
      // If mismatched → immediate doLogout() without deleting any data.
      sessionVersion: settingsDoc.session_version
    });
  } catch (err) {
    console.error('Seats API error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
