// routes/authRoutes.js
// POST /api/login           — authenticate and return sessionVersion
// POST /api/changePassword  — update password
// POST /api/forceLogoutAll  — admin: bump sessionVersion to invalidate all sessions

const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const Staff     = require('../models/Staff');
const Settings  = require('../models/Settings');
const SystemLog = require('../models/SystemLog');

function clientIp (req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

// ── POST /api/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const ip = clientIp(req);
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required.'
    });
  }

  try {
    const user = await Staff.findOne({ staffId: username.trim().toLowerCase() });

    if (!user) {
      await SystemLog.record(
        'LOGIN_FAILURE',
        `Unknown username attempted: ${username.trim().toLowerCase()}`,
        { username: username.trim().toLowerCase() },
        username.trim().toLowerCase(), ip
      );
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const passwordMatch = await user.comparePassword(password);

    if (!passwordMatch) {
      await SystemLog.record(
        'LOGIN_FAILURE',
        `Wrong password for ${user.staffId}`,
        { username: user.staffId },
        user.staffId, ip
      );
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // Fetch current sessionVersion so the client can detect forced logouts
    const settingsDoc      = await Settings.getSettings();
    const sessionVersion   = settingsDoc.session_version;

    await SystemLog.record(
      'LOGIN_SUCCESS',
      `${user.staffId} logged in`,
      { role: user.role, sessionVersion },
      user.staffId, ip
    );

    return res.json({
      success: true,
      user: {
        _id:            user._id.toString(),
        id:             user._id.toString(),
        name:           user.staff_name,
        username:       user.staffId,
        department:     user.department,
        role:           user.role,
        mustChangePw:   user.must_change_pw
      },
      // ── Force-logout support ─────────────────────────────────────────
      // Client stores this value in localStorage alongside the user object.
      // Every GET /api/seats returns the current sessionVersion.
      // If they differ, the client calls doLogout() immediately.
      sessionVersion
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/changePassword ──────────────────────────────────────────
router.post('/changePassword', async (req, res) => {
  const ip = clientIp(req);
  const { userId, newPassword } = req.body || {};

  if (!userId || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'userId and newPassword are required.'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters.'
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await Staff.findByIdAndUpdate(
      userId,
      { password: hashedPassword, must_change_pw: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await SystemLog.record(
      'PASSWORD_CHANGED',
      `${user.staffId} changed their password`,
      {},
      user.staffId, ip
    );

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('ChangePassword error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── POST /api/forceLogoutAll ──────────────────────────────────────────
// Admin-only endpoint. Increments session_version in Settings.
// Every active client compares the sessionVersion returned by GET /api/seats
// against the value stored at login. On mismatch, doLogout() is called
// immediately — without deleting any user, booking, or history data.
router.post('/forceLogoutAll', async (req, res) => {
  const ip = clientIp(req);
  // Identify the requesting admin from the request body (no JWT in this system)
  const { adminUsername } = req.body || {};

  try {
    const settingsDoc = await Settings.getSettings();
    const oldVersion  = settingsDoc.session_version;
    settingsDoc.session_version = oldVersion + 1;
    await settingsDoc.save();

    await SystemLog.record(
      'SESSION_INVALIDATED',
      `All active sessions invalidated by ${adminUsername || 'admin'}. ` +
      `sessionVersion bumped ${oldVersion} → ${settingsDoc.session_version}`,
      { oldVersion, newVersion: settingsDoc.session_version },
      adminUsername || 'admin', ip
    );

    console.log(`[forceLogoutAll] sessionVersion bumped ${oldVersion} → ${settingsDoc.session_version}`);

    return res.json({
      success:           true,
      message:           'All active sessions have been invalidated. Users will be logged out on their next poll.',
      sessionVersion:    settingsDoc.session_version
    });
  } catch (err) {
    console.error('forceLogoutAll error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
