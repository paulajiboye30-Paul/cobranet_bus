/**
 * Cobranet Staff Bus Booking System - Book Seat API
 * 
 * This serverless function handles seat booking operations.
 * POST /api/bookSeat - Books a seat for a staff member
 * GET /api/bookSeat - Gets today's bookings
 * 
 * Features:
 * - Prevents double booking (one seat per staff)
 * - Prevents booking already taken seats
 * - Records booking timestamp
 * - Supports changing existing bookings
 */

const { MongoClient, ObjectId } = require('mongodb');

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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const bookingsCollection = db.collection('bookings');
    const todayKey = getTodayKey();

    // GET request - fetch today's bookings
    if (req.method === 'GET') {
      const bookings = await bookingsCollection.find({ date: todayKey }).toArray();
      
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

      return res.status(200).json({
        success: true,
        bookings: formattedBookings,
        date: todayKey
      });
    }

    // POST request - book a seat
    if (req.method === 'POST') {
      const { seatNumber, userId, username, name } = req.body || {};

      // Validate input
      if (!seatNumber || !userId || !username || !name) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: seatNumber, userId, username, name'
        });
      }

      const seatNum = String(seatNumber);

      // Check if seat is already taken by another user
      const existingBooking = await bookingsCollection.findOne({
        date: todayKey,
        seatNumber: seatNum
      });

      if (existingBooking && existingBooking.username !== username) {
        return res.status(409).json({
          success: false,
          message: `Seat ${seatNum} was just taken — please choose another.`,
          conflict: true
        });
      }

      // If user already has a booking, remove it (changing seat)
      await bookingsCollection.deleteMany({
        date: todayKey,
        username: username
      });

      // Create new booking
      const bookingTime = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const newBooking = {
        seatNumber: seatNum,
        userId: new ObjectId(userId),
        username: username,
        name: name,
        date: todayKey,
        bookingTime: bookingTime,
        createdAt: new Date()
      };

      await bookingsCollection.insertOne(newBooking);

      return res.status(200).json({
        success: true,
        message: `Seat ${seatNum} reserved!`,
        booking: {
          seatNumber: seatNum,
          username: username,
          name: name,
          time: bookingTime,
          date: todayKey
        }
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('BookSeat error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while booking. Please try again.'
    });
  }
};
