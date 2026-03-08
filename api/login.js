/**
 * Cobranet Staff Bus Booking System - Login API
 * 
 * This serverless function handles staff authentication.
 * POST /api/login - Authenticates staff and returns user details
 * 
 * Request body: { username: string, password: string }
 * Response: { success: boolean, user?: object, message?: string }
 */

const { MongoClient } = require('mongodb');

// MongoDB connection URI from environment variables
// Supports both MONGODB_URI and MONGODB_URL for flexibility
const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DB_NAME || 'cobranet_bus_booking';

// Cache the database connection for reuse across invocations
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

// Initialize default data if not exists
async function seedDefaultData(db) {
  const usersCollection = db.collection('users');
  const count = await usersCollection.countDocuments();
  
  if (count === 0) {
    // No users exist, create default users
    const defaultUsers = [
      { username: 'admin', password: 'admin123', name: 'System Administrator', role: 'admin', mustChangePw: false, createdAt: new Date() },
      { username: 'jdoe', password: 'pass123', name: 'John Doe', role: 'staff', mustChangePw: true, createdAt: new Date() },
      { username: 'asmith', password: 'pass123', name: 'Alice Smith', role: 'staff', mustChangePw: true, createdAt: new Date() },
      { username: 'bjohnson', password: 'pass123', name: 'Bob Johnson', role: 'staff', mustChangePw: true, createdAt: new Date() },
      { username: 'cmwangi', password: 'pass123', name: 'Catherine Mwangi', role: 'staff', mustChangePw: true, createdAt: new Date() },
      { username: 'dafolabi', password: 'pass123', name: 'David Afolabi', role: 'staff', mustChangePw: true, createdAt: new Date() },
    ];
    await usersCollection.insertMany(defaultUsers);
  }

  // Initialize settings if not exists
  const settingsCollection = db.collection('settings');
  const settingsCount = await settingsCollection.countDocuments();
  if (settingsCount === 0) {
    await settingsCollection.insertOne({
      openTime: '16:50',
      closeTime: '17:00',
      resultsTime: '17:20',
      totalSeats: 30,
      createdAt: new Date()
    });
  }
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
    const { username, password } = req.body || {};

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter your username and password.' 
      });
    }

    const { db } = await connectToDatabase();
    await seedDefaultData(db);

    // Find user by username and password
    const user = await db.collection('users').findOne({ 
      username: username.trim().toLowerCase(),
      password: password // In production, use bcrypt for password hashing
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password. Please try again.' 
      });
    }

    // Return user data (excluding password)
    const { password: _, ...userWithoutPassword } = user;

    return res.status(200).json({
      success: true,
      user: {
        ...userWithoutPassword,
        _id: user._id.toString()
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred during login. Please try again.' 
    });
  }
};
