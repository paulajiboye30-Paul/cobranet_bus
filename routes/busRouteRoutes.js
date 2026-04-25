// routes/busRouteRoutes.js
// Endpoints:
//   GET    /api/routes/today      — fetch today's route (Lagos timezone)
//   GET    /api/routes            — list all saved routes (admin)
//   POST   /api/routes            — create a new route
//   PUT    /api/routes/:id        — update an existing route
//   DELETE /api/routes/:id        — delete a route

const express  = require('express');
const router   = express.Router();
const BusRoute = require('../models/BusRoute');

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns today's date string in Lagos time (Africa/Lagos = UTC+1)
 * as "YYYY-MM-DD".
 */
function getLagosDateString () {
  const now = new Date();
  // toLocaleString with a timezone gives us the wall-clock date in Lagos
  const lagosString = now.toLocaleString('en-CA', { timeZone: 'Africa/Lagos' });
  // en-CA locale formats as "YYYY-MM-DD, HH:MM:SS" — take the date part
  return lagosString.split(',')[0].trim();
}

// ── GET /api/routes/today ─────────────────────────────────────────────────
router.get('/routes/today', async (req, res) => {
  try {
    const today = getLagosDateString();
    const route = await BusRoute.findOne({ date: today });

    if (!route) {
      return res.json({ success: true, route: null });
    }

    return res.json({ success: true, route });
  } catch (err) {
    console.error('[routes/today] error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/routes ───────────────────────────────────────────────────────
router.get('/routes', async (req, res) => {
  try {
    const routes = await BusRoute.find().sort({ date: -1 }).lean();
    // Apply toJSON transform manually since we used .lean()
    const mapped = routes.map(r => ({
      id:               r._id.toString(),
      _id:              r._id.toString(),
      date:             r.date,
      routeCoordinates: r.route_coordinates,
      stops:            r.stops,
      createdAt:        r.createdAt,
      updatedAt:        r.updatedAt,
    }));
    return res.json({ success: true, routes: mapped });
  } catch (err) {
    console.error('[routes GET] error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/routes ──────────────────────────────────────────────────────
router.post('/routes', async (req, res) => {
  try {
    const { date, routeCoordinates, stops } = req.body || {};

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'A valid date (YYYY-MM-DD) is required.' });
    }

    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 route coordinates are required.' });
    }

    // Validate coordinate pairs
    for (const pt of routeCoordinates) {
      if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
        return res.status(400).json({ success: false, message: 'Invalid coordinate format. Expected [lat, lng] pairs.' });
      }
    }

    // Validate stops
    const cleanStops = [];
    if (Array.isArray(stops)) {
      for (const s of stops) {
        if (!s.name || typeof s.lat !== 'number' || typeof s.lng !== 'number') {
          return res.status(400).json({ success: false, message: 'Each stop must have name, lat, and lng.' });
        }
        cleanStops.push({ name: s.name.trim(), lat: s.lat, lng: s.lng });
      }
    }

    const existing = await BusRoute.findOne({ date });
    if (existing) {
      return res.status(409).json({ success: false, message: `A route for ${date} already exists. Use PUT to update it.` });
    }

    const newRoute = await BusRoute.create({
      date,
      route_coordinates: routeCoordinates,
      stops: cleanStops,
    });

    return res.status(201).json({ success: true, route: newRoute });
  } catch (err) {
    console.error('[routes POST] error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A route for that date already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── PUT /api/routes/:id ───────────────────────────────────────────────────
router.put('/routes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, routeCoordinates, stops } = req.body || {};

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Expected YYYY-MM-DD.' });
    }

    if (routeCoordinates !== undefined) {
      if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
        return res.status(400).json({ success: false, message: 'At least 2 route coordinates are required.' });
      }
      for (const pt of routeCoordinates) {
        if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
          return res.status(400).json({ success: false, message: 'Invalid coordinate format.' });
        }
      }
    }

    const updates = {};
    if (date)              updates.date              = date;
    if (routeCoordinates)  updates.route_coordinates = routeCoordinates;
    if (Array.isArray(stops)) {
      updates.stops = stops.map(s => ({ name: String(s.name).trim(), lat: s.lat, lng: s.lng }));
    }

    const updated = await BusRoute.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Route not found.' });
    }

    return res.json({ success: true, route: updated });
  } catch (err) {
    console.error('[routes PUT] error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A route for that date already exists.' });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── DELETE /api/routes/:id ────────────────────────────────────────────────
router.delete('/routes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BusRoute.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Route not found.' });
    }

    return res.json({ success: true, message: 'Route deleted.' });
  } catch (err) {
    console.error('[routes DELETE] error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
