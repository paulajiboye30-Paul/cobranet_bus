/**
 * Cobranet Staff Bus Booking System - Settings API
 * 
 * This serverless function handles system settings.
 * GET /api/settings - Returns current settings
 * POST /api/settings - Updates settings
 * 
 * Settings include:
 * - openTime: When booking opens (HH:MM)
 * - closeTime: When booking closes (HH:MM)
 * - resultsTime: When results are displayed until (HH:MM)
 * - totalSeats: Total number of bus seats
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const settingsCollection = db.collection('settings');

    // GET - Fetch settings
    if (req.method === 'GET') {
      let settings = await settingsCollection.findOne({});

      if (!settings) {
        // Return default settings if none exist
        settings = {
          openTime: '16:50',
          closeTime: '17:00',
          resultsTime: '17:20',
          totalSeats: 30
        };
      }

      return res.status(200).json({
        success: true,
        settings: {
          openTime: settings.openTime,
          closeTime: settings.closeTime,
          resultsTime: settings.resultsTime,
          totalSeats: settings.totalSeats
        }
      });
    }

    // POST - Update settings
    if (req.method === 'POST') {
      const { openTime, closeTime, resultsTime, totalSeats } = req.body || {};

      const updateData = {};
      if (openTime !== undefined) updateData.openTime = openTime;
      if (closeTime !== undefined) updateData.closeTime = closeTime;
      if (resultsTime !== undefined) updateData.resultsTime = resultsTime;
      if (totalSeats !== undefined) updateData.totalSeats = parseInt(totalSeats);
      updateData.updatedAt = new Date();

      // Use upsert to create if not exists
      await settingsCollection.updateOne(
        {},
        { $set: updateData },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: 'Settings saved successfully.',
        settings: updateData
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
};
