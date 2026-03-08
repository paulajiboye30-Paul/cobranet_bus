/**
 * Cobranet Staff Bus Booking System - History API
 * 
 * This serverless function handles booking history operations.
 * GET /api/history - Returns all booking history
 * DELETE /api/history - Clears all booking history
 * 
 * Features:
 * - Returns complete booking history across all dates
 * - Supports clearing all history (admin only)
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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const bookingsCollection = db.collection('bookings');

    // GET - Fetch all booking history
    if (req.method === 'GET') {
      const bookings = await bookingsCollection.find({}).toArray();

      // Group bookings by date
      const historyByDate = {};
      bookings.forEach(booking => {
        if (!historyByDate[booking.date]) {
          historyByDate[booking.date] = {};
        }
        historyByDate[booking.date][booking.seatNumber] = {
          username: booking.username,
          name: booking.name,
          time: booking.bookingTime,
          userId: booking.userId ? booking.userId.toString() : null
        };
      });

      // Also return as flat array for table display
      const flatHistory = bookings.map(booking => ({
        date: booking.date,
        seat: parseInt(booking.seatNumber),
        name: booking.name,
        username: booking.username,
        time: booking.bookingTime
      })).sort((a, b) => {
        // Sort by date descending, then by seat number ascending
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return a.seat - b.seat;
      });

      return res.status(200).json({
        success: true,
        history: historyByDate,
        flatHistory: flatHistory,
        totalBookings: bookings.length,
        uniqueDays: Object.keys(historyByDate).length
      });
    }

    // DELETE - Clear all history
    if (req.method === 'DELETE') {
      const result = await bookingsCollection.deleteMany({});

      return res.status(200).json({
        success: true,
        message: 'All booking history has been cleared.',
        deletedCount: result.deletedCount
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
};
