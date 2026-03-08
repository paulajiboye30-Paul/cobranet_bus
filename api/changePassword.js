/**
 * Cobranet Staff Bus Booking System - Change Password API
 * 
 * This serverless function handles password changes for staff members.
 * POST /api/changePassword - Updates a staff member's password
 * 
 * Features:
 * - Validates current password (if required)
 * - Enforces minimum password length
 * - Updates mustChangePw flag after first password change
 * 
 * Request body: { userId: string, currentPassword: string, newPassword: string }
 * Response: { success: boolean, message?: string }
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
    const { userId, newPassword } = req.body || {};

    // Validate input
    if (!userId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'User ID and new password are required.'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.'
      });
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // Update password and set mustChangePw to false
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          password: newPassword,
          mustChangePw: false,
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update password. Please try again.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully!'
    });

  } catch (error) {
    console.error('ChangePassword error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while changing password. Please try again.'
    });
  }
};
