// routes/adminBookingRoutes.js
// POST /api/adminBooking  — admin manual booking for any date
// GET  /api/adminBooking  — upcoming bookings (today + future)

const express      = require('express');
const router       = express.Router();
const mongoose     = require('mongoose');
const DailyBooking = require('../models/DailyBooking');
const Reservation  = require('../models/TemporaryReservation');
const Settings     = require('../models/Settings');
const Staff        = require('../models/Staff');

function timeStrToMinutes(str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function dayRangeFor(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end   = new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

// Format a booking_date (Date object) back to 'YYYY-MM-DD' using local
// constructor values rather than UTC ISO string, which can shift the date
// by one day when the server timezone is behind UTC.
function formatLocalDate(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dd}`;
}

// ── GET /api/adminBooking — upcoming bookings (today and future) ──────────────
// Optional ?date=YYYY-MM-DD returns booked seat numbers for that date (seat filter).
router.get('/', async (req, res) => {
  try {
    const queryDate = (req.query && req.query.date) ? req.query.date : null;

    // When ?date= is supplied return only the seat numbers already booked that
    // day so the frontend can disable them in the seat-number dropdown.
    if (queryDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
        return res.status(400).json({ success: false, message: 'Invalid date format.' });
      }
      const { start, end } = dayRangeFor(queryDate);
      const taken = await DailyBooking
        .find({ booking_date: { $gte: start, $lt: end } })
        .select('seat_number')
        .lean();
      return res.json({ success: true, bookedSeats: taken.map(r => r.seat_number) });
    }

    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const rows = await DailyBooking
      .find({ booking_date: { $gte: todayStart }, is_admin_booking: true })
      .sort({ booking_date: 1, seat_number: 1 })
      .lean();

    const bookings = rows.map(r => ({
      id:        r._id.toString(),
      date:      formatLocalDate(r.booking_date),
      time:      r.booking_time,
      seat:      r.seat_number,
      staffId:   r.staffId,
      staffName: r.staff_name && r.staff_name.trim() ? r.staff_name.trim() : r.staffId
    }));

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error('adminBooking GET error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/adminBooking — create a manual admin booking ───────────────────
//
// Priority rule: an admin manual booking ALWAYS takes precedence over a regular
// staff self-booking.  If a regular booking already exists for the same seat or
// the same staffId on the requested date it is deleted atomically inside a
// transaction before the admin booking is inserted.  The transaction also
// re-checks for admin-vs-admin conflicts inside the session so concurrent admin
// requests cannot race past the pre-checks.
router.post('/', async (req, res) => {
  try {
    const {
      adminId,
      booking_date,
      booking_time,
      staff_name,
      staffId,
      seat_number
    } = req.body || {};

    // ── 1. Required field checks ──────────────────────────────────────────────
    if (!adminId || !booking_date || !booking_time || !staff_name || !staffId || !seat_number) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // ── 2. Verify caller is an admin ──────────────────────────────────────────
    let adminDoc;
    try {
      adminDoc = await Staff.findById(adminId).lean();
    } catch (_) {
      return res.status(400).json({ success: false, message: 'Invalid admin ID.' });
    }
    if (!adminDoc || adminDoc.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    // ── 3. Validate date format ───────────────────────────────────────────────
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    const { start: dayStart, end: dayEnd } = dayRangeFor(booking_date);
    if (isNaN(dayStart.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date.' });
    }

    // ── 4. Validate time format and booking window ────────────────────────────
    if (!/^\d{2}:\d{2}$/.test(booking_time)) {
      return res.status(400).json({ success: false, message: 'Invalid time format. Use HH:MM.' });
    }
    const settings  = await Settings.getSettings();
    const reqMins   = timeStrToMinutes(booking_time);
    const openMins  = timeStrToMinutes(settings.booking_start_time);
    const closeMins = timeStrToMinutes(settings.booking_end_time);
    if (reqMins < openMins || reqMins >= closeMins) {
      return res.status(403).json({
        success: false,
        message: `Booking time must be within the window ${settings.booking_start_time}–${settings.booking_end_time}.`
      });
    }

    // ── 5. Validate seat number ───────────────────────────────────────────────
    const seatNum = parseInt(seat_number, 10);
    if (isNaN(seatNum) || seatNum < 1 || seatNum > (settings.total_seats || 60)) {
      return res.status(400).json({
        success: false,
        message: `Seat must be between 1 and ${settings.total_seats || 60}.`
      });
    }

    const staffIdLower = staffId.toLowerCase().trim();
    if (!staffIdLower) {
      return res.status(400).json({ success: false, message: 'Staff ID cannot be empty.' });
    }

    // ── 6. Seat blocked by reservation ───────────────────────────────────────
    const now = new Date();
    const reservation = await Reservation.findOne({
      seat_number: seatNum,
      status:      'active',
      $or: [
        { reservation_type: 'permanent' },
        { reservation_type: 'temporary', expires_at: { $gt: now } }
      ]
    });
    if (reservation) {
      return res.status(409).json({
        success: false,
        message: `Seat ${seatNum} is reserved and unavailable.`
      });
    }

    // ── 7 & 8. Atomic priority booking ───────────────────────────────────────
    //
    // Admin bookings can override existing regular (non-admin) bookings for the
    // same seat or staffId.  The conflict check and the write are performed
    // inside a single MongoDB transaction so no concurrent request can slip
    // between them.
    //
    // What is rejected (admin-vs-admin): if another admin booking already
    // exists for the requested seat OR the requested staffId on that date,
    // the request is refused — admins cannot silently overwrite each other.
    //
    // What is overridden (admin-vs-regular): any regular (non-admin) booking
    // for the requested seat or staffId is deleted before the new admin booking
    // is inserted, giving the admin assignment unconditional priority.
    //
    // The transaction is automatically retried by the MongoDB driver on
    // transient write-conflict errors (e.g. a concurrent regular booking that
    // committed after the transaction's read snapshot was taken).
    let newBooking;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // ── 7a. Admin-vs-admin conflict: seat ───────────────────────────────
        const adminSeatConflict = await DailyBooking.findOne(
          {
            seat_number:      seatNum,
            booking_date:     { $gte: dayStart, $lt: dayEnd },
            is_admin_booking: true
          },
          null,
          { session }
        );
        if (adminSeatConflict) {
          const e = new Error(`Seat ${seatNum} is already admin-booked on that date.`);
          e._appError = true; e._status = 409;
          throw e;
        }

        // ── 7b. Admin-vs-admin conflict: staffId ────────────────────────────
        const adminStaffConflict = await DailyBooking.findOne(
          {
            staffId:          staffIdLower,
            booking_date:     { $gte: dayStart, $lt: dayEnd },
            is_admin_booking: true
          },
          null,
          { session }
        );
        if (adminStaffConflict) {
          const e = new Error(`${staffIdLower} already has an admin booking on that date.`);
          e._appError = true; e._status = 409;
          throw e;
        }

        // ── 8. Override any conflicting regular (non-admin) bookings ─────────
        // Delete any non-admin booking that would violate the seat or staffId
        // uniqueness constraint.  This gives the admin booking priority over
        // any regular booking that was created before this transaction runs.
        await DailyBooking.deleteMany(
          {
            booking_date:     { $gte: dayStart, $lt: dayEnd },
            is_admin_booking: { $ne: true },
            $or: [
              { seat_number: seatNum },
              { staffId:     staffIdLower }
            ]
          },
          { session }
        );

        // ── 9. Insert the admin booking ──────────────────────────────────────
        const [created] = await DailyBooking.create(
          [{
            staff_id:         adminDoc._id,
            staffId:          staffIdLower,
            staff_name:       staff_name.trim(),
            seat_number:      seatNum,
            booking_date:     dayStart,
            booking_time:     booking_time + ':00',
            is_admin_booking: true
          }],
          { session }
        );
        newBooking = created;
      });
    } finally {
      await session.endSession();
    }

    // Send the success response immediately after the DB write succeeds.
    // Audit logging is fire-and-forget and must never affect the response.
    res.json({
      success: true,
      message: `Seat ${seatNum} booked for ${staff_name.trim()} on ${booking_date}.`,
      booking: {
        id:        newBooking._id.toString(),
        date:      booking_date,
        time:      booking_time + ':00',
        seat:      seatNum,
        staffId:   staffIdLower,
        staffName: staff_name.trim()
      }
    });

    // Fire-and-forget audit — failure must not affect the already-sent response.
    try {
      console.info(
        `[ADMIN_BOOKING] Admin ${adminDoc.username} booked seat ${seatNum} ` +
        `for ${staffIdLower} on ${booking_date} at ${booking_time}`
      );
    } catch (_) { /* swallow */ }

  } catch (err) {
    // Application-level conflict (admin-vs-admin) thrown from inside the transaction.
    if (err._appError) {
      return res.status(err._status || 409).json({ success: false, message: err.message });
    }

    console.error('adminBooking POST error:', err);

    if (err.code === 11000) {
      // A concurrent admin booking committed between our transaction checks and
      // our insert — this is the admin-vs-admin race edge case.
      const key = Object.keys(err.keyPattern || {})[0] || '';
      const msg = key.includes('staffId')
        ? 'Staff already has a booking on that date.'
        : 'Seat already taken on that date.';
      return res.status(409).json({ success: false, message: msg });
    }

    // Guard: only send a 500 if the response has not already been sent.
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
  }
});

module.exports = router;
