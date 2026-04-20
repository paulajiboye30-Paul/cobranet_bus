// routes/bookSeatRoute.js
// GET    /api/bookSeat  — today's bookings
// POST   /api/bookSeat  — book a seat  (server-time validated)
// DELETE /api/bookSeat  — release a seat (changeMyBooking)
//
// ── Server-time enforcement ──────────────────────────────────────────
// The booking window check uses Node's system clock (Africa/Lagos WAT = UTC+1).
// The frontend device clock is NEVER trusted for this check.
// Any POST request outside the booking window is rejected with HTTP 403.

const express      = require('express');
const router       = express.Router();
const DailyBooking = require('../models/DailyBooking');
const Reservation  = require('../models/TemporaryReservation');
const Settings     = require('../models/Settings');
const SystemLog    = require('../models/SystemLog');

// ── Africa/Lagos time helpers (WAT = UTC+1, no DST) ──────────────────

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function lagosNow ()         { return new Date(Date.now() + LAGOS_OFFSET_MS); }
function lagosDay ()         { return lagosNow().getUTCDay(); }
function lagosMinuteOfDay () {
  const t = lagosNow();
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}
function lagosISOString ()   { return lagosNow().toISOString().replace('Z', '+01:00'); }
function timeStrToMinutes (str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// ── Misc helpers ──────────────────────────────────────────────────────

function getTodayRange () {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

function currentTime () {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function clientIp (req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

// ── GET /api/bookSeat — today's bookings ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { start: todayStart, end: todayEnd } = getTodayRange();
    const todayStr = todayStart.toISOString().split('T')[0];

    const rows = await DailyBooking
      .find({ booking_date: { $gte: todayStart, $lt: todayEnd } })
      .populate('staff_id', 'staff_name staffId department');

    const bookings = {};
    rows.forEach(row => {
      const staffDoc = row.staff_id;
      bookings[String(row.seat_number)] = {
        username:   staffDoc ? staffDoc.staffId    : row.staffId,
        name:       staffDoc ? staffDoc.staff_name : row.staffId,  // BUG FIX: fallback
        department: staffDoc ? staffDoc.department : '',
        time:       row.booking_time,
        date:       todayStr
      };
    });

    return res.json({ success: true, bookings, date: todayStr });
  } catch (err) {
    console.error('bookSeat GET error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/bookSeat — book a seat ─────────────────────────────────
router.post('/', async (req, res) => {
  const ip           = clientIp(req);
  const { seatNumber, userId, username, name } = req.body || {};
  const staffIdLower = (username || '').toLowerCase();

  try {
    if (!seatNumber || !userId || !username) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: seatNumber, userId, username'
      });
    }

    const seatNum = parseInt(seatNumber, 10);
    if (isNaN(seatNum) || seatNum < 1) {
      return res.status(400).json({ success: false, message: 'Invalid seat number.' });
    }

    // ── SERVER-TIME VALIDATION ────────────────────────────────────────
    // Uses Node system clock (NTP-synchronised on the host).
    // Device/client time is completely ignored at this layer.
    const settingsDoc = await Settings.getSettings();
    const serverDay   = lagosDay();
    const nowMins     = lagosMinuteOfDay();
    const openMins    = timeStrToMinutes(settingsDoc.booking_start_time);
    const closeMins   = timeStrToMinutes(settingsDoc.booking_end_time);

    if (serverDay === 0 || serverDay === 6) {
      await SystemLog.record(
        'SEAT_BOOKING_REJECTED',
        `Weekend booking attempt by ${staffIdLower}`,
        { seat: seatNum, serverTime: lagosISOString() },
        staffIdLower, ip
      );
      return res.status(403).json({
        success: false,
        message: 'Booking is not available on weekends. Server time is used.'
      });
    }

    if (nowMins < openMins || nowMins >= closeMins) {
      await SystemLog.record(
        'EARLY_BOOKING_ATTEMPT',
        `Out-of-window booking attempt by ${staffIdLower} at server time ${lagosISOString()}`,
        {
          seat:            seatNum,
          serverLagosTime: lagosISOString(),
          windowOpen:      settingsDoc.booking_start_time,
          windowClose:     settingsDoc.booking_end_time
        },
        staffIdLower, ip
      );
      return res.status(403).json({
        success: false,
        message: `Booking window is ${settingsDoc.booking_start_time}–${settingsDoc.booking_end_time} (Lagos time). ` +
                 `Server time is used — device time cannot bypass this check.`
      });
    }
    // ── END SERVER-TIME VALIDATION ────────────────────────────────────

    const { start: todayStart, end: todayEnd } = getTodayRange();
    const todayStr = todayStart.toISOString().split('T')[0];
    const now      = new Date();

    // CHECK 1 — Seat blocked by admin reservation
    const reservation = await Reservation.findOne({
      seat_number: seatNum,
      status:      'active',
      $or: [
        { reservation_type: 'permanent' },
        { reservation_type: 'temporary', expires_at: { $gt: now } }
      ]
    });

    if (reservation) {
      await SystemLog.record(
        'SEAT_BOOKING_REJECTED',
        `Seat ${seatNum} is admin-reserved (${reservation.reservation_type})`,
        { seat: seatNum, reservationType: reservation.reservation_type },
        staffIdLower, ip
      );
      return res.status(409).json({
        success: false,
        message: `Seat ${seatNum} is reserved and unavailable.`
      });
    }

    // CHECK 2 — Seat already taken today
    const seatTaken = await DailyBooking.findOne({
      seat_number:  seatNum,
      booking_date: { $gte: todayStart, $lt: todayEnd }
    });

    if (seatTaken) {
      await SystemLog.record(
        'SEAT_BOOKING_REJECTED',
        `Seat ${seatNum} already taken when ${staffIdLower} attempted`,
        { seat: seatNum },
        staffIdLower, ip
      );
      return res.status(409).json({ success: false, message: 'Seat already taken', conflict: true });
    }

    // CHECK 3 — Staff already has a seat today
    const existingStaffBooking = await DailyBooking.findOne({
      staffId:      staffIdLower,
      booking_date: { $gte: todayStart, $lt: todayEnd }
    });

    if (existingStaffBooking) {
      await SystemLog.record(
        'DUPLICATE_BOOKING_ATTEMPT',
        `${staffIdLower} already holds seat ${existingStaffBooking.seat_number} today`,
        { existingSeat: existingStaffBooking.seat_number, requestedSeat: seatNum },
        staffIdLower, ip
      );
      return res.status(409).json({
        success: false,
        message: 'Staff already has a seat today'
      });
    }

    // CREATE booking
    const newBooking = await DailyBooking.create({
      staff_id:     userId,
      staffId:      staffIdLower,
      seat_number:  seatNum,
      booking_date: todayStart,
      booking_time: currentTime()
    });

    await SystemLog.record(
      'SEAT_BOOKED',
      `${staffIdLower} booked seat ${seatNum}`,
      { seat: seatNum, bookingTime: newBooking.booking_time, date: todayStr },
      staffIdLower, ip
    );

    return res.json({
      success: true,
      message: `Seat ${seatNum} reserved!`,
      booking: {
        seatNumber: String(seatNum),
        username,
        name:       name || '',
        time:       newBooking.booking_time,
        date:       todayStr
      }
    });
  } catch (err) {
    console.error('bookSeat POST error:', err);

    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0] || '';
      const msg = key.includes('staffId') ? 'Staff already has a seat today' : 'Seat already taken';
      await SystemLog.record(
        'SEAT_BOOKING_REJECTED',
        `Mongo unique violation for ${staffIdLower}: ${msg}`,
        { errorKey: key },
        staffIdLower, ip
      );
      return res.status(409).json({ success: false, message: msg, conflict: true });
    }

    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── DELETE /api/bookSeat — release a seat ────────────────────────────
router.delete('/', async (req, res) => {
  const ip = clientIp(req);
  try {
    const { seatNumber, userId, username } = req.body || {};
    const staffIdLower = (username || '').toLowerCase();

    if (!seatNumber || !userId) {
      return res.status(400).json({
        success: false,
        message: 'seatNumber and userId are required.'
      });
    }

    const seatNum = parseInt(seatNumber, 10);
    const { start: todayStart, end: todayEnd } = getTodayRange();

    const result = await DailyBooking.deleteOne({
      staff_id:     userId,
      seat_number:  seatNum,
      booking_date: { $gte: todayStart, $lt: todayEnd }
    });

    await SystemLog.record(
      'SEAT_RELEASED',
      `${staffIdLower} released seat ${seatNum}`,
      { seat: seatNum, deleted: result.deletedCount },
      staffIdLower, ip
    );

    return res.json({
      success:      true,
      message:      `Seat ${seatNum} released for ${username || userId}.`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error('bookSeat DELETE error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
