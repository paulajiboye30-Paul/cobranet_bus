/**
 * Cobranet Staff Bus Booking System - Test Mode API
 * 
 * This serverless function handles testing mode state.
 * GET /api/testMode - Returns current test mode state
 * POST /api/testMode - Updates test mode state
 * 
 * Test mode allows admin to simulate different booking phases
 * without waiting for the real schedule.
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
    const testModeCollection = db.collection('testMode');

    // GET - Fetch test mode state
    if (req.method === 'GET') {
      const doc = await testModeCollection.findOne({ _id: 'testMode' });
      
      return res.status(200).json({
        success: true,
        testMode: doc ? doc.data : { active: false, state: 'before_open' }
      });
    }

    // POST - Update test mode state
    if (req.method === 'POST') {
      const { active, state } = req.body || {};

      const updateData = {};
      if (active !== undefined) updateData.active = active;
      if (state !== undefined) updateData.state = state;
      updateData.updatedAt = new Date();

      // Get current state or use default
      const currentDoc = await testModeCollection.findOne({ _id: 'testMode' });
      const currentData = currentDoc ? currentDoc.data : { active: false, state: 'before_open' };

      // Merge with current data
      const newData = {
        ...currentData,
        ...updateData
      };

      await testModeCollection.updateOne(
        { _id: 'testMode' },
        { $set: { data: newData } },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: 'Test mode updated.',
        testMode: newData
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('TestMode API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
};
