/**
 * Cobranet Staff Bus Booking System - Reservations API
 * 
 * This serverless function handles seat reservations.
 * GET /api/reservations - Returns all reservations
 * POST /api/reservations - Creates a new reservation
 * DELETE /api/reservations - Removes a reservation
 * 
 * Reservations allow admin to reserve seats permanently or temporarily
 * for specific purposes (e.g., driver seat, admin seat).
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const reservationsCollection = db.collection('reservations');

    // GET - Fetch all reservations
    if (req.method === 'GET') {
      const doc = await reservationsCollection.findOne({ _id: 'reservations' });
      const reservations = doc ? doc.data : [];

      return res.status(200).json({
        success: true,
        reservations: reservations
      });
    }

    // POST - Create new reservation
    if (req.method === 'POST') {
      const { seat, label, type, days } = req.body || {};

      if (!seat || !label || !type) {
        return res.status(400).json({
          success: false,
          message: 'Seat, label, and type are required.'
        });
      }

      const seatNum = parseInt(seat);

      // Get current reservations
      const doc = await reservationsCollection.findOne({ _id: 'reservations' });
      let reservations = doc ? doc.data : [];

      // Check if seat already has a reservation
      const existingIndex = reservations.findIndex(r => r.seat === seatNum);
      if (existingIndex !== -1) {
        return res.status(409).json({
          success: false,
          message: `Seat ${seatNum} already has a reservation. Remove it first.`
        });
      }

      const newReservation = {
        seat: seatNum,
        label: label.trim(),
        type: type,
        createdDate: getTodayKey()
      };

      if (type === 'temporary' && days) {
        const exp = new Date();
        exp.setDate(exp.getDate() + parseInt(days) - 1);
        newReservation.expiresDate = exp.toISOString().split('T')[0];
        newReservation.days = parseInt(days);
      }

      reservations.push(newReservation);

      // Save reservations
      await reservationsCollection.updateOne(
        { _id: 'reservations' },
        { $set: { data: reservations } },
        { upsert: true }
      );

      return res.status(201).json({
        success: true,
        message: `Seat ${seatNum} reserved successfully.`,
        reservation: newReservation
      });
    }

    // DELETE - Remove reservation
    if (req.method === 'DELETE') {
      const { seat } = req.body || {};

      if (!seat) {
        return res.status(400).json({
          success: false,
          message: 'Seat number is required.'
        });
      }

      const seatNum = parseInt(seat);

      // Get current reservations
      const doc = await reservationsCollection.findOne({ _id: 'reservations' });
      let reservations = doc ? doc.data : [];

      // Filter out the reservation
      const newReservations = reservations.filter(r => r.seat !== seatNum);

      if (newReservations.length === reservations.length) {
        return res.status(404).json({
          success: false,
          message: 'Reservation not found.'
        });
      }

      // Save updated reservations
      await reservationsCollection.updateOne(
        { _id: 'reservations' },
        { $set: { data: newReservations } },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: `Reservation for Seat ${seatNum} removed.`
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Reservations API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
};
