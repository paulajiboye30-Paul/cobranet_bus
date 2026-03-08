/**
 * Cobranet Staff Bus Booking System - Staff Management API
 * 
 * This serverless function handles staff CRUD operations.
 * GET /api/staff - Returns all staff members
 * POST /api/staff - Creates a new staff member
 * PUT /api/staff - Updates a staff member
 * DELETE /api/staff - Removes a staff member
 * 
 * Admin-only endpoints for managing staff users.
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    // GET - Fetch all staff members
    if (req.method === 'GET') {
      const users = await usersCollection.find({}).toArray();
      
      // Remove passwords from response
      const sanitizedUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return {
          ...userWithoutPassword,
          _id: user._id.toString()
        };
      });

      return res.status(200).json({
        success: true,
        users: sanitizedUsers
      });
    }

    // POST - Create new staff member
    if (req.method === 'POST') {
      const { name, username, password, role = 'staff' } = req.body || {};

      if (!name || !username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, username, and password are required.'
        });
      }

      const normalizedUsername = username.trim().toLowerCase();

      // Check if username already exists
      const existingUser = await usersCollection.findOne({ username: normalizedUsername });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Username already exists.'
        });
      }

      const newUser = {
        username: normalizedUsername,
        password: password,
        name: name.trim(),
        role: role,
        mustChangePw: true,
        createdAt: new Date()
      };

      const result = await usersCollection.insertOne(newUser);

      return res.status(201).json({
        success: true,
        message: 'Staff member added successfully.',
        user: {
          _id: result.insertedId.toString(),
          username: newUser.username,
          name: newUser.name,
          role: newUser.role,
          mustChangePw: newUser.mustChangePw
        }
      });
    }

    // PUT - Update staff member
    if (req.method === 'PUT') {
      const { userId, name, password, role } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required.'
        });
      }

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (role) updateData.role = role;
      if (password) {
        updateData.password = password;
        updateData.mustChangePw = true;
      }
      updateData.updatedAt = new Date();

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Staff member updated successfully.'
      });
    }

    // DELETE - Remove staff member
    if (req.method === 'DELETE') {
      const { userId } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required.'
        });
      }

      // Prevent deleting the admin user
      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (user && user.username === 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot delete the system administrator.'
        });
      }

      const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found.'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Staff member removed successfully.'
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Staff API error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred. Please try again.'
    });
  }
};
