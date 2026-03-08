/**
 * Cobranet Staff Bus Booking System - Seats API
 * 
 * This serverless function returns all booked seats information.
 * GET /api/seats - Returns all booked seats for today
 * 
 * Features:
 * - Returns today's seat bookings
 * - Includes staff details for each booking
 * - Returns seat reservation information
 * 
 * Response: { success: boolean, bookings: object, reservations: array, settings: object }
 */

const { MongoClient } = require('mongodb');

// Support both MONGODB_URI and MONGODB_URL environment variables
const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DB_NAME || 'cobranet_bus_booking';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!uri) {
    throw new Error('MONGODB_URI or MONGODB_URL environment variable is not set');
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// Get today's date key (YYYY-MM-DD)
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

// Get active reserved seats (not expired)
function getActiveReservedSeats(reservations) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return reservations.filter(r => {
    if (r.type === 'permanent') return true;
    if (r.type === 'temporary') {
      const exp = new Date(r.expiresDate);
      exp.setHours(23, 59, 59, 999);
      return exp >= now;
    }
    return false;
  });
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const todayKey = getTodayKey();

    // Get today's bookings
    const bookings = await db.collection('bookings')
      .find({ date: todayKey })
      .toArray();

    // Format bookings as a seat-number keyed object
    const formattedBookings = {};
    bookings.forEach(booking => {
      formattedBookings[booking.seatNumber] = {
        username: booking.username,
        name: booking.name,
        time: booking.bookingTime,
        date: booking.date,
        userId: booking.userId ? booking.userId.toString() : null
      };
    });

    // Get reservations
    const reservationsDoc = await db.collection('reservations').findOne({ _id: 'reservations' });
    const reservations = reservationsDoc ? reservationsDoc.data : [];
    const activeReservations = getActiveReservedSeats(reservations);

    // Get settings
    const settings = await db.collection('settings').findOne({});

    // Get test mode state
    const testModeDoc = await db.collection('testMode').findOne({ _id: 'testMode' });

    return res.status(200).json({
      success: true,
      bookings: formattedBookings,
      reservations: activeReservations,
      settings: settings ? {
        openTime: settings.openTime,
        closeTime: settings.closeTime,
        resultsTime: settings.resultsTime,
        totalSeats: settings.totalSeats
      } : {
        openTime: '16:50',
        closeTime: '17:00',
        resultsTime: '17:20',
        totalSeats: 30
      },
      testMode: testModeDoc ? testModeDoc.data : { active: false, state: 'before_open' },
      date: todayKey
    });

  } catch (error) {
    console.error('Seats error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching seat information.'
    });
  }
};
