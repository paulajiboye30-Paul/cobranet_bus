// routes/adminBookingRoutes.js
// POST /api/adminBooking  — admin manual booking for any date
// GET  /api/adminBooking  — upcoming bookings (today + future)

const express      = require('express');
const router       = express.Router();
const DailyBooking = require('../models/DailyBooking');
const Reservation  = require('../models/TemporaryReservation');
const Settings     = require('../models/Settings');
const Staff        = require('../models/Staff');
const SystemLog    = require('../models/SystemLog');

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

// ── GET /api/adminBooking — upcoming bookings (today and future) ──────────────
router.get('/', async (req, res) => {
  try {
    const todayStart = (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate());
    })();

    const rows = await DailyBooking
      .find({ booking_date: { $gte: todayStart }, is_admin_booking: true })
      .sort({ booking_date: 1, seat_number: 1 })
      .lean();

    const bookings = rows.map(r => ({
      id:          r._id.toString(),
      date:        r.booking_date.toISOString().split('T')[0],
      time:        r.booking_time,
      seat:        r.seat_number,
      staffId:     r.staffId,
      staffName:   r.staff_name || r.staffId
    }));

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error('adminBooking GET error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/adminBooking — create a manual admin booking ───────────────────
router.post('/', async (req, res) => {
  try {
    const {
      adminId,
      booking_date,   // 'YYYY-MM-DD'
      booking_time,   // 'HH:MM'
      staff_name,
      staffId,
      seat_number
    } = req.body || {};

    // ── 1. Required field checks ──────────────────────────────────────────────
    if (!adminId || !booking_date || !booking_time || !staff_name || !staffId || !seat_number) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // ── 2. Verify caller is an admin ──────────────────────────────────────────
    const adminDoc = await Staff.findById(adminId).lean();
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
    if (isNaN(seatNum) || seatNum < 1 || seatNum > settings.total_seats) {
      return res.status(400).json({
        success: false,
        message: `Seat must be between 1 and ${settings.total_seats}.`
      });
    }

    const staffIdLower = staffId.toLowerCase().trim();

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

    // ── 7. Seat already booked that day ──────────────────────────────────────
    const seatTaken = await DailyBooking.findOne({
      seat_number:  seatNum,
      booking_date: { $gte: dayStart, $lt: dayEnd }
    });
    if (seatTaken) {
      return res.status(409).json({ success: false, message: `Seat ${seatNum} is already booked on that date.` });
    }

    // ── 8. Staff already has a booking that day ───────────────────────────────
    const staffBooked = await DailyBooking.findOne({
      staffId:      staffIdLower,
      booking_date: { $gte: dayStart, $lt: dayEnd }
    });
    if (staffBooked) {
      return res.status(409).json({ success: false, message: `${staffIdLower} already has a booking on that date.` });
    }

    // ── 9. Create booking ─────────────────────────────────────────────────────
    const newBooking = await DailyBooking.create({
      staff_id:         adminDoc._id,   // admin is the technical owner
      staffId:          staffIdLower,
      staff_name:       staff_name.trim(),
      seat_number:      seatNum,
      booking_date:     dayStart,
      booking_time:     booking_time + ':00',
      is_admin_booking: true
    });

    await SystemLog.record(
      'ADMIN_MANUAL_BOOKING',
      `Admin ${adminDoc.username} manually booked seat ${seatNum} for ${staffIdLower} on ${booking_date}`,
      { seat: seatNum, date: booking_date, time: booking_time },
      adminDoc.username,
      ''
    );

    return res.json({
      success: true,
      message: `Seat ${seatNum} booked for ${staff_name} on ${booking_date}.`,
      booking: {
        id:        newBooking._id.toString(),
        date:      booking_date,
        time:      booking_time,
        seat:      seatNum,
        staffId:   staffIdLower,
        staffName: staff_name.trim()
      }
    });

  } catch (err) {
    console.error('adminBooking POST error:', err);

    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0] || '';
      const msg = key.includes('staffId') ? 'Staff already has a booking on that date.' : 'Seat already taken on that date.';
      return res.status(409).json({ success: false, message: msg });
    }

    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
