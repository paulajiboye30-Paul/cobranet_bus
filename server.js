// server.js
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const connectDB  = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Database ──────────────────────────────────────────────────────
connectDB();

// ── Global middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────
// Staff CRUD
app.use('/api/staff',         require('./routes/staffRoutes'));

// Authentication, force-logout
// POST /api/login
// POST /api/changePassword
// POST /api/forceLogoutAll
app.use('/api',               require('./routes/authRoutes'));

// Seat data — bookings + reservations + settings + sessionVersion
// Also serves GET /api/serverTime (authoritative NTP-synced time)
app.use('/api',               require('./api/seats'));

// Seat booking  GET / POST / DELETE /api/bookSeat
app.use('/api/bookSeat',      require('./routes/bookSeatRoute'));

// Admin reservations  GET / POST / DELETE /api/reservations
app.use('/api/reservations',  require('./routes/reservationRoutes'));

// System settings  GET / POST /api/settings
app.use('/api/settings',      require('./routes/settingsRoutes'));

// Booking history  GET / DELETE /api/history
app.use('/api/history',       require('./routes/historyRoutes'));

// Reset today's bookings  POST /api/resetBookings
app.use('/api/resetBookings', require('./routes/resetBookingsRoute'));

// Manual reservation expiry (also triggered by cron)  POST /api/expireReservations
app.use('/api/expireReservations', require('./routes/expireRoute'));

// ── Error handler (must be last) ─────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
