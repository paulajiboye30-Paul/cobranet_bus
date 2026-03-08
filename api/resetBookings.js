/**
 * Cobranet Staff Bus Booking System - Reset Bookings API
 * 
 * This serverless function handles resetting bookings.
 * POST /api/resetBookings - Clears today's bookings
 * 
 * Admin-only endpoint to clear all seat bookings for today.
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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const bookingsCollection = db.collection('bookings');
    const todayKey = getTodayKey();

    // Delete all bookings for today
    const result = await bookingsCollection.deleteMany({ date: todayKey });

    return res.status(200).json({
      success: true,
      message: "Today's bookings have been reset.",
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('ResetBookings API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
};
