/**
 * Cobranet Staff Bus Booking System - Frontend JavaScript
 * 
 * This file contains all the client-side logic for the bus booking system.
 * It communicates with the backend API for all data operations.
 * 
 * API Endpoints:
 * - POST /api/login - Staff authentication
 * - POST /api/bookSeat - Book a seat
 * - GET  /api/bookSeat - Get today's bookings
 * - POST /api/changePassword - Change password
 * - GET  /api/seats - Get all seat info (bookings, reservations, settings)
 * - GET/POST /api/staff - Staff management
 * - GET/POST /api/settings - System settings
 * - GET/POST /api/reservations - Seat reservations
 * - GET/POST /api/testMode - Test mode state
 * - POST /api/resetBookings - Reset today's bookings
 * - GET/DELETE /api/history - Booking history
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

// API Base URL - Automatically detects if running on Vercel or locally
const API_BASE = window.location.hostname.includes('localhost') 
  ? 'http://localhost:3000/api' 
  : '/api';

// ═══════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// Current logged-in user
let currentUser = null;

// Cached data from server
let cachedBookings = {};
let cachedSettings = {};
let cachedReservations = [];
let cachedTestMode = { active: false, state: 'before_open' };
let cachedUsers = [];
let cachedHistory = [];

// ═══════════════════════════════════════════════════════════════
// API HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Makes an API request with error handling
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method
 * @param {object} body - Request body (for POST/PUT)
 * @returns {Promise<object>} - Response data
 */
async function apiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Handles staff login
 * Sends credentials to API and stores user session
 */
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;

  if (!username || !password) {
    showLoginError('Please enter your username and password.');
    return;
  }

  try {
    const data = await apiRequest('/login', 'POST', { username, password });

    if (data.success) {
      currentUser = data.user;

      // BUG 1 FIX — Persist session so a page refresh does not log the user out.
      // We store only the fields needed to restore routing; the password is never stored.
      localStorage.setItem('cobranet_user', JSON.stringify({
        _id:         currentUser._id,
        id:          currentUser._id,   // alias used by some API calls
        name:        currentUser.name,
        username:    currentUser.username,
        role:        currentUser.role,
        mustChangePw: currentUser.mustChangePw || false
      }));

      document.getElementById('login-error').classList.add('hidden');
      document.getElementById('login-user').value = '';
      document.getElementById('login-pass').value = '';

      if (currentUser.mustChangePw) {
        showPage('page-change-password');
      } else {
        afterLogin();
      }
    } else {
      showLoginError(data.message || 'Invalid username or password.');
    }
  } catch (error) {
    showLoginError('Network error. Please try again.');
  }
}

/**
 * Shows login error message
 */
function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/**
 * Handles post-login routing
 */
async function afterLogin() {
  // Load all necessary data from server
  await loadAllData();

  if (currentUser.role === 'admin') {
    showPage('page-admin');
    refreshAdminPage();
  } else {
    showPage('page-dashboard');
    document.getElementById('dash-username').textContent = currentUser.name;
    refreshDashboard();
  }
}

/**
 * Logs out the current user
 */
function doLogout() {
  // BUG 1 FIX — Remove the persisted session so the next page load returns to login.
  localStorage.removeItem('cobranet_user');

  currentUser = null;
  cachedBookings = {};
  cachedUsers = [];
  showPage('page-login');
}

// ═══════════════════════════════════════════════════════════════
// PASSWORD CHANGE
// ═══════════════════════════════════════════════════════════════

/**
 * Checks password strength and updates UI
 */
function checkPwStrength() {
  const pw = document.getElementById('new-pw-1').value;
  const bar = document.getElementById('pw-strength-bar');
  const lbl = document.getElementById('pw-strength-label');

  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;

  const cols = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];
  const lbls = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

  bar.style.width = (s * 20) + '%';
  bar.style.background = s ? cols[s - 1] : 'var(--gray-200)';
  lbl.textContent = s ? lbls[s - 1] : '';
  lbl.style.color = s ? cols[s - 1] : 'var(--gray-500)';
}

/**
 * Handles password change submission
 */
async function doChangePassword() {
  const pw1 = document.getElementById('new-pw-1').value;
  const pw2 = document.getElementById('new-pw-2').value;
  const err = document.getElementById('pw-change-error');

  if (pw1.length < 6) {
    err.textContent = 'Password must be at least 6 characters.';
    err.classList.remove('hidden');
    return;
  }

  if (pw1 !== pw2) {
    err.textContent = 'Passwords do not match.';
    err.classList.remove('hidden');
    return;
  }

  try {
    const data = await apiRequest('/changePassword', 'POST', {
      userId: currentUser._id,
      newPassword: pw1
    });

    if (data.success) {
      currentUser.mustChangePw = false;

      // BUG 1 FIX — Refresh the stored session now that mustChangePw is cleared,
      // otherwise a refresh would land back on the change-password page.
      localStorage.setItem('cobranet_user', JSON.stringify({
        _id:          currentUser._id,
        id:           currentUser._id,
        name:         currentUser.name,
        username:     currentUser.username,
        role:         currentUser.role,
        mustChangePw: false
      }));

      err.classList.add('hidden');
      document.getElementById('new-pw-1').value = '';
      document.getElementById('new-pw-2').value = '';
      showToast('✅ Password set! Welcome to Cobranet Bus Booking.', 'success');
      afterLogin();
    } else {
      err.textContent = data.message || 'Failed to change password.';
      err.classList.remove('hidden');
    }
  } catch (error) {
    err.textContent = 'Network error. Please try again.';
    err.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Loads all necessary data from the server
 */
async function loadAllData() {
  try {
    // Load seats data (includes bookings, reservations, settings, testMode)
    const seatsData = await apiRequest('/seats', 'GET');
    if (seatsData.success) {
      cachedBookings = seatsData.bookings || {};
      cachedReservations = seatsData.reservations || [];
      cachedSettings = seatsData.settings || {
        openTime: '16:50',
        closeTime: '17:00',
        resultsTime: '17:20',
        totalSeats: 30
      };
      cachedTestMode = seatsData.testMode || { active: false, state: 'before_open' };
    }

    // Load users (for admin)
    if (currentUser && currentUser.role === 'admin') {
      const usersData = await apiRequest('/staff', 'GET');
      if (usersData.success) {
        cachedUsers = usersData.users || [];
      }

      // Load history
      const historyData = await apiRequest('/history', 'GET');
      if (historyData.success) {
        cachedHistory = historyData.flatHistory || [];
      }
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

/**
 * Refreshes bookings data
 */
async function refreshBookings() {
  try {
    const seatsData = await apiRequest('/seats', 'GET');
    if (seatsData.success) {
      cachedBookings = seatsData.bookings || {};
      cachedReservations = seatsData.reservations || [];
      cachedTestMode = seatsData.testMode || { active: false, state: 'before_open' };
    }
  } catch (error) {
    console.error('Error refreshing bookings:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTING & NAVIGATION
// ═══════════════════════════════════════════════════════════════

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goToDashboard() {
  showPage('page-dashboard');
  document.getElementById('dash-username').textContent = currentUser.name;
  refreshDashboard();
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM STATE
// ═══════════════════════════════════════════════════════════════

function getRealState() {
  const now = new Date();
  const day = now.getDay();

  if (day === 0 || day === 6) return 'weekend';

  const s = cachedSettings;
  const tm = (h, m) => h * 60 + m;
  const nm = tm(now.getHours(), now.getMinutes());
  const [oh, om] = s.openTime.split(':').map(Number);
  const [ch, cm] = s.closeTime.split(':').map(Number);
  const [rh, rm] = s.resultsTime.split(':').map(Number);

  if (nm < tm(oh, om)) return 'before_open';
  if (nm < tm(ch, cm)) return 'open';
  if (nm < tm(rh, rm)) return 'results';
  return 'reset';
}

function getSystemState() {
  return cachedTestMode.active ? cachedTestMode.state : getRealState();
}

function parseTimeStr(t) {
  const [h, m] = t.split(':').map(Number);
  return { h, m };
}

function msToNext(h, m) {
  const now = new Date();
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t - now;
}

function msToNextWeekdayFriday(h, m) {
  const now = new Date();
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  while (t <= now || t.getDay() === 0 || t.getDay() === 6) t.setDate(t.getDate() + 1);
  return t - now;
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, '0')).join(':');
}

// ═══════════════════════════════════════════════════════════════
// TESTING MODE
// ═══════════════════════════════════════════════════════════════

async function toggleTestMode() {
  const newActive = !cachedTestMode.active;
  const newState = newActive ? 'before_open' : 'before_open';

  try {
    const data = await apiRequest('/testMode', 'POST', {
      active: newActive,
      state: newState
    });

    if (data.success) {
      cachedTestMode = data.testMode;
      updateTestModeUI();
      showToast(
        cachedTestMode.active
          ? '⚙ Testing mode ENABLED — use buttons to simulate states.'
          : '✅ Testing mode disabled — synced to real schedule.',
        cachedTestMode.active ? '' : 'success'
      );
      refreshAdminStats();
    }
  } catch (error) {
    showToast('Failed to toggle test mode.', 'error');
  }
}

async function setTestState(state) {
  if (!cachedTestMode.active) return;

  try {
    const data = await apiRequest('/testMode', 'POST', { state: state });

    if (data.success) {
      cachedTestMode = data.testMode;
      const labels = {
        open: 'Booking Open',
        results: 'Results Displaying',
        before_open: 'Booking Closed',
        weekend: 'Weekend'
      };
      document.getElementById('test-state-val').textContent = labels[state] || state;
      showToast('Simulated: ' + (labels[state] || state), '');
    }
  } catch (error) {
    showToast('Failed to set test state.', 'error');
  }
}

function updateTestModeUI() {
  const btn = document.getElementById('btn-toggle-test');
  const badge = document.getElementById('test-mode-nav-badge');
  const testBtns = ['btn-set-open', 'btn-set-results', 'btn-set-closed'];
  const info = document.getElementById('test-state-info');

  if (cachedTestMode.active) {
    btn.textContent = '⏹ Disable Testing Mode';
    btn.className = 'btn btn-danger btn-sm';
    badge.classList.remove('hidden');
    testBtns.forEach(id => document.getElementById(id).classList.remove('hidden'));
    info.style.display = 'flex';
    info.classList.remove('hidden');
    const labels = {
      open: 'Booking Open',
      results: 'Results Displaying',
      before_open: 'Booking Closed',
      weekend: 'Weekend'
    };
    document.getElementById('test-state-val').textContent = labels[cachedTestMode.state] || cachedTestMode.state;
  } else {
    btn.textContent = '▶ Enable Testing Mode';
    btn.className = 'btn btn-primary btn-sm';
    badge.classList.add('hidden');
    testBtns.forEach(id => document.getElementById(id).classList.add('hidden'));
    info.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

async function refreshDashboard() {
  if (!currentUser) return;

  // Refresh bookings data
  await refreshBookings();

  const state = getSystemState();
  const bk = cachedBookings;
  const s = cachedSettings;

  ['countdown-section', 'seat-section', 'results-section', 'my-booking-card'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );

  const banner = document.getElementById('status-banner');
  const dot = document.getElementById('banner-dot');
  const txt = document.getElementById('banner-text');
  banner.className = 'status-banner';

  if (state === 'open') {
    banner.classList.add('banner-open');
    dot.className = 'banner-dot dot-green';
    txt.textContent = cachedTestMode.active
      ? '⚙ [TEST MODE] Booking is OPEN — select a seat to test.'
      : '🟢 Booking is OPEN — Select your seat now! Closes at ' + s.closeTime;
    renderSeatGrid(bk, s.totalSeats, true);
    document.getElementById('seat-section').classList.remove('hidden');

    const mine = Object.entries(bk).find(([, v]) => v.username === currentUser.username);
    if (mine) {
      document.getElementById('my-booking-card').classList.remove('hidden');
      document.getElementById('my-booking-num').textContent = mine[0];
      document.getElementById('my-booking-label').textContent = 'Seat ' + mine[0] + ' — Booked at ' + mine[1].time;
    }

    const taken = Object.keys(bk).length;
    document.getElementById('seats-remaining').textContent =
      s.totalSeats - taken + ' seat' + (s.totalSeats - taken !== 1 ? 's' : '') + ' remaining';
  } else if (state === 'results') {
    banner.classList.add('banner-results');
    dot.className = 'banner-dot dot-brand';
    txt.textContent = cachedTestMode.active
      ? "⚙ [TEST MODE] Results view active."
      : "📋 Booking CLOSED — Today's seat assignments are shown below.";
    renderResultsTable(bk);
    document.getElementById('results-section').classList.remove('hidden');
  } else if (state === 'weekend') {
    banner.classList.add('banner-weekend');
    dot.className = 'banner-dot dot-amber';
    txt.textContent = '📅 Bus booking is not available on weekends. See you Monday!';
    const { h, m } = parseTimeStr(s.openTime);
    document.getElementById('countdown-display').textContent = formatCountdown(msToNextWeekdayFriday(h, m));
    document.getElementById('countdown-sub').textContent = 'Next booking window: Monday at ' + s.openTime;
    document.getElementById('countdown-section').classList.remove('hidden');
  } else {
    banner.classList.add('banner-closed');
    dot.className = 'banner-dot dot-red';
    if (cachedTestMode.active) txt.textContent = '⚙ [TEST MODE] Booking is CLOSED (simulated).';
    else if (state === 'before_open') txt.textContent = '🔒 Booking not yet open. Opens at ' + s.openTime + ' today.';
    else txt.textContent = '🔒 Booking has closed for today. Resets tomorrow at ' + s.openTime + '.';
    const { h, m } = parseTimeStr(s.openTime);
    const ms = !cachedTestMode.active && state === 'before_open' ? msToNext(h, m) : msToNextWeekdayFriday(h, m);
    document.getElementById('countdown-display').textContent = formatCountdown(ms);
    document.getElementById('countdown-sub').textContent = cachedTestMode.active
      ? 'Real schedule opens at ' + s.openTime
      : 'Seat booking opens at ' + s.openTime;
    document.getElementById('countdown-section').classList.remove('hidden');
  }
}

function renderSeatGrid(bk, total, interactive) {
  const grid = document.getElementById('seat-grid');
  grid.innerHTML = '';

  const mine = Object.entries(bk).find(([, v]) => v.username === currentUser?.username);
  const reservedSeats = getActiveReservedSeats();
  const effectiveBk = { ...bk };

  reservedSeats.forEach(sNum => {
    if (!effectiveBk[sNum]) effectiveBk[sNum] = { username: '__reserved__', name: '', _reserved: true };
  });

  for (let i = 1; i <= total; i++) {
    const sNum = String(i);
    const btn = document.createElement('button');
    btn.className = 'seat-btn';

    if (mine && sNum === mine[0]) {
      btn.classList.add('seat-mine');
      btn.innerHTML = `<span class="seat-num">${i}</span><span class="seat-label">YOURS</span>`;
      btn.disabled = true;
    } else if (effectiveBk[sNum]) {
      btn.classList.add('seat-taken');
      btn.innerHTML = `<span class="seat-num">${i}</span><span class="seat-label">TAKEN</span>`;
      if (!effectiveBk[sNum]._reserved && effectiveBk[sNum].name) btn.title = 'Taken';
      btn.disabled = true;
    } else if (!interactive) {
      btn.classList.add('seat-disabled');
      btn.innerHTML = `<span class="seat-num">${i}</span><span class="seat-label">—</span>`;
      btn.disabled = true;
    } else {
      btn.classList.add('seat-available');
      btn.innerHTML = `<span class="seat-num">${i}</span><span class="seat-label">FREE</span>`;
      btn.onclick = () => selectSeat(i);
    }

    grid.appendChild(btn);
  }
}

async function selectSeat(num) {
  if (!currentUser) return;
  if (getSystemState() !== 'open') {
    showToast('Seat booking is not open right now.', 'error');
    return;
  }

  const sNum = String(num);
  const reservedSeats = getActiveReservedSeats();

  if (reservedSeats.includes(sNum)) {
    showToast('Seat ' + num + ' is not available. Please choose another.', 'error');
    refreshDashboard();
    return;
  }

  if (cachedBookings[sNum]) {
    showToast('Seat ' + num + ' was just taken — please choose another.', 'error');
    refreshDashboard();
    return;
  }

  try {
    const data = await apiRequest('/bookSeat', 'POST', {
      seatNumber: num,
      userId: currentUser._id,
      username: currentUser.username,
      name: currentUser.name
    });

    if (data.success) {
      cachedBookings = { ...cachedBookings, [sNum]: data.booking };
      showToast('✅ Seat ' + num + ' reserved!', 'success');
      refreshDashboard();
    } else {
      showToast(data.message || 'Failed to book seat.', 'error');
      refreshDashboard();
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  }
}

async function changeMyBooking() {
  if (getSystemState() !== 'open') {
    showToast('Booking window is closed.', 'error');
    return;
  }

  const prev = Object.entries(cachedBookings).find(([, v]) => v.username === currentUser.username);
  if (prev) {
    delete cachedBookings[prev[0]];
  }

  showToast('Seat released — please select a new seat.', '');
  refreshDashboard();
}

function renderResultsTable(bk) {
  const tbody = document.getElementById('results-body');
  const dateEl = document.getElementById('results-date-text');
  if (dateEl) dateEl.textContent = formatResultsDate();

  const entries = Object.entries(bk)
    .filter(([, v]) => !v._reserved)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  document.getElementById('results-count').textContent = entries.length + ' staff booked';
  tbody.innerHTML = '';

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No bookings for today.</td></tr>';
    return;
  }

  entries.forEach(([seat, info], idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx + 1}</td><td><span class="badge badge-brand">Seat ${seat}</span></td><td>${info.name}</td><td>${info.time}</td>`;
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════

function refreshAdminPage() {
  updateTestModeUI();
  refreshAdminStats();
  renderUsersTable();
  renderAdminBookings();
  renderHistory();
  loadSettingsForm();
  populateResSeatSelect();
  renderReservationsList();
}

function refreshAdminStats() {
  const users = cachedUsers.filter(u => u.role === 'staff');
  const bk = cachedBookings;
  const s = cachedSettings;
  const allDays = new Set(cachedHistory.map(h => h.date)).size;

  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${users.length}</div><div class="stat-label">Staff Members</div></div>
    <div class="stat-card"><div class="stat-value">${Object.keys(bk).length}</div><div class="stat-label">Today's Bookings</div></div>
    <div class="stat-card"><div class="stat-value">${s.totalSeats - Object.keys(bk).length}</div><div class="stat-label">Seats Free</div></div>
    <div class="stat-card"><div class="stat-value">${cachedReservations.length}</div><div class="stat-label">Reserved Seats</div></div>
    <div class="stat-card"><div class="stat-value">${allDays}</div><div class="stat-label">Days Recorded</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${cachedTestMode.active ? 'var(--brand)' : 'var(--green)'}">${cachedTestMode.active ? 'ON' : 'OFF'}</div><div class="stat-label">Test Mode</div></div>
  `;
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';

  cachedUsers.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code style="background:var(--gray-100);padding:.2rem .4rem;border-radius:4px;font-size:.82rem;">${u.username}</code></td>
      <td>${u.name}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-black' : 'badge-gray'}">${u.role}</span></td>
      <td><span class="badge ${u.mustChangePw ? 'badge-red' : 'badge-green'}">${u.mustChangePw ? 'Temp (must change)' : 'Personal'}</span></td>
      <td>${u.username !== 'admin'
        ? `<div style="display:flex;gap:.4rem;"><button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u._id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="removeUser('${u._id}')">Remove</button></div>`
        : '<span class="text-muted text-sm">Protected</span>'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderAdminBookings() {
  const tbody = document.getElementById('admin-bookings-body');
  const entries = Object.entries(cachedBookings).sort((a, b) => Number(a[0]) - Number(b[0]));

  tbody.innerHTML = '';
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No bookings today.</td></tr>';
    return;
  }

  entries.forEach(([seat, info]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="badge badge-brand">Seat ${seat}</span></td><td>${info.name}</td><td>${info.username}</td><td>${info.time}</td><td>${info.date}</td>`;
    tbody.appendChild(tr);
  });
}

function renderHistory() {
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';

  const rows = [...cachedHistory].sort((a, b) => b.date.localeCompare(a.date) || a.seat - b.seat);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No history found.</td></tr>';
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td><span class="badge badge-brand">Seat ${r.seat}</span></td><td>${r.name}</td><td>${r.username}</td><td>${r.time}</td>`;
    tbody.appendChild(tr);
  });
}

function loadSettingsForm() {
  const s = cachedSettings;
  document.getElementById('setting-open').value = s.openTime || '16:50';
  document.getElementById('setting-close').value = s.closeTime || '17:00';
  document.getElementById('setting-results').value = s.resultsTime || '17:20';
  document.getElementById('setting-seats').value = s.totalSeats || 30;
}

async function saveSettings() {
  const settings = {
    openTime: document.getElementById('setting-open').value,
    closeTime: document.getElementById('setting-close').value,
    resultsTime: document.getElementById('setting-results').value,
    totalSeats: parseInt(document.getElementById('setting-seats').value)
  };

  try {
    const data = await apiRequest('/settings', 'POST', settings);
    if (data.success) {
      cachedSettings = settings;
      showToast('Settings saved.', 'success');
    } else {
      showToast(data.message || 'Failed to save settings.', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function openAddUserModal() {
  openModal('Add New Staff Member', `
    <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="m-name" type="text" placeholder="e.g. Jane Okafor"/></div>
    <div class="form-group"><label class="form-label">Username</label><input class="form-input" id="m-username" type="text" placeholder="e.g. jokafor"/></div>
    <div class="form-group"><label class="form-label">Temporary Password</label><input class="form-input" id="m-password" type="password" placeholder="Temporary password (staff will change on first login)"/></div>
    <div class="form-group"><label class="form-label">Role</label><select class="form-input" id="m-role"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
    <p class="text-sm text-muted mt-2">Staff will be prompted to set a new personal password on first login.</p>
    <div id="m-error" class="form-error hidden"></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    { label: 'Add Staff', cls: 'btn-primary', fn: doAddUser }
  ]);
}

async function doAddUser() {
  const name = document.getElementById('m-name').value.trim();
  const username = document.getElementById('m-username').value.trim().toLowerCase();
  const password = document.getElementById('m-password').value;
  const role = document.getElementById('m-role').value;
  const err = document.getElementById('m-error');

  if (!name || !username || !password) {
    err.textContent = 'All fields are required.';
    err.classList.remove('hidden');
    return;
  }

  try {
    const data = await apiRequest('/staff', 'POST', { name, username, password, role });

    if (data.success) {
      cachedUsers.push(data.user);
      closeModal();
      renderUsersTable();
      refreshAdminStats();
      showToast('Staff member added. They will set their password on first login.', 'success');
    } else {
      err.textContent = data.message || 'Failed to add staff member.';
      err.classList.remove('hidden');
    }
  } catch (error) {
    err.textContent = 'Network error. Please try again.';
    err.classList.remove('hidden');
  }
}

function openEditUserModal(userId) {
  const u = cachedUsers.find(x => x._id === userId);
  if (!u) return;

  openModal('Edit Staff Member', `
    <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="m-name" type="text" value="${u.name}"/></div>
    <div class="form-group"><label class="form-label">Reset Password (leave blank to keep current)</label><input class="form-input" id="m-password" type="password" placeholder="New temporary password"/></div>
    <div class="form-group"><label class="form-label">Role</label><select class="form-input" id="m-role"><option value="staff"${u.role === 'staff' ? ' selected' : ''}>Staff</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>Admin</option></select></div>
    <div id="m-error" class="form-error hidden"></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', fn: () => doEditUser(userId) }
  ]);
}

async function doEditUser(userId) {
  const name = document.getElementById('m-name').value.trim();
  const password = document.getElementById('m-password').value;
  const role = document.getElementById('m-role').value;
  const err = document.getElementById('m-error');

  if (!name) {
    err.textContent = 'Name is required.';
    err.classList.remove('hidden');
    return;
  }

  const updateData = { userId, name, role };
  if (password) updateData.password = password;

  try {
    const data = await apiRequest('/staff', 'PUT', updateData);

    if (data.success) {
      const idx = cachedUsers.findIndex(u => u._id === userId);
      if (idx !== -1) {
        cachedUsers[idx].name = name;
        cachedUsers[idx].role = role;
        if (password) cachedUsers[idx].mustChangePw = true;
      }
      closeModal();
      renderUsersTable();
      showToast('Staff member updated.', 'success');
    } else {
      err.textContent = data.message || 'Failed to update staff member.';
      err.classList.remove('hidden');
    }
  } catch (error) {
    err.textContent = 'Network error. Please try again.';
    err.classList.remove('hidden');
  }
}

async function removeUser(userId) {
  const u = cachedUsers.find(x => x._id === userId);
  if (!u) return;

  openModal('Remove Staff Member', `<p class="text-sm">Are you sure you want to remove <strong>${u.username}</strong>? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    {
      label: 'Remove',
      cls: 'btn-danger',
      fn: async () => {
        try {
          const data = await apiRequest('/staff', 'DELETE', { userId });
          if (data.success) {
            cachedUsers = cachedUsers.filter(u => u._id !== userId);
            closeModal();
            renderUsersTable();
            refreshAdminStats();
            showToast('Staff member removed.', '');
          } else {
            showToast(data.message || 'Failed to remove staff member.', 'error');
          }
        } catch (error) {
          showToast('Network error. Please try again.', 'error');
        }
      }
    }
  ]);
}

// ═══════════════════════════════════════════════════════════════
// BOOKING MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function confirmResetBookings() {
  openModal("Reset Today's Bookings", `<p class="text-sm text-muted">This clears all seat bookings for today. Staff will need to re-select their seats.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    {
      label: 'Reset Bookings',
      cls: 'btn-danger',
      fn: async () => {
        try {
          const data = await apiRequest('/resetBookings', 'POST');
          if (data.success) {
            cachedBookings = {};
            closeModal();
            renderAdminBookings();
            refreshAdminStats();
            showToast("Today's bookings reset.", '');
          } else {
            showToast(data.message || 'Failed to reset bookings.', 'error');
          }
        } catch (error) {
          showToast('Network error. Please try again.', 'error');
        }
      }
    }
  ]);
}

function confirmClearHistory() {
  openModal('Clear All History', `<p class="text-sm" style="color:var(--red);">This permanently deletes ALL booking history. This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', fn: closeModal },
    {
      label: 'Clear All History',
      cls: 'btn-danger',
      fn: async () => {
        try {
          const data = await apiRequest('/history', 'DELETE');
          if (data.success) {
            cachedHistory = [];
            cachedBookings = {};
            closeModal();
            renderHistory();
            renderAdminBookings();
            refreshAdminStats();
            showToast('All history cleared.', '');
          } else {
            showToast(data.message || 'Failed to clear history.', 'error');
          }
        } catch (error) {
          showToast('Network error. Please try again.', 'error');
        }
      }
    }
  ]);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const bk = cachedBookings;
  const date = new Date().toISOString().split('T')[0];

  doc.setFillColor(255, 130, 16);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text('Cobranet Limited', 14, 14);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Staff Bus Seat Assignments — ' + date, 14, 23);

  let y = 42;
  doc.setFillColor(17, 17, 17);
  doc.rect(14, y - 5, 182, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('#', 16, y);
  doc.text('Seat', 28, y);
  doc.text('Staff Name', 55, y);
  doc.text('Time Selected', 148, y);

  y += 10;
  doc.setFont(undefined, 'normal');
  doc.setTextColor(30, 30, 30);

  const entries = Object.entries(bk).sort((a, b) => Number(a[0]) - Number(b[0]));
  entries.forEach(([seat, info], idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(255, 244, 232);
      doc.rect(14, y - 5, 182, 8, 'F');
    }
    doc.text(String(idx + 1), 16, y);
    doc.text('Seat ' + seat, 28, y);
    doc.text(info.name, 55, y);
    doc.text(info.time, 148, y);
    y += 9;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });

  doc.setFontSize(7);
  doc.setTextColor(170);
  doc.text('Generated: ' + new Date().toLocaleString() + ' | Cobranet Limited Bus Booking System', 14, 290);
  doc.save('cobranet-seats-' + date + '.pdf');
  showToast('PDF exported!', 'success');
}

function exportExcel() {
  const bk = cachedBookings;
  const date = new Date().toISOString().split('T')[0];
  const rows = [['#', 'Seat No.', 'Staff Name', 'Username', 'Time Selected', 'Date']];

  Object.entries(bk)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([seat, info], idx) => rows.push([idx + 1, Number(seat), info.name, info.username, info.time, info.date]));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Seat Assignments');
  XLSX.writeFile(wb, 'cobranet-seats-' + date + '.xlsx');
  showToast('Excel exported!', 'success');
}

// ═══════════════════════════════════════════════════════════════
// RESERVATIONS
// ═══════════════════════════════════════════════════════════════

function getActiveReservedSeats() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return cachedReservations
    .filter(r => {
      if (r.type === 'permanent') return true;
      if (r.type === 'temporary') {
        const exp = new Date(r.expiresDate);
        exp.setHours(23, 59, 59, 999);
        return exp >= now;
      }
      return false;
    })
    .map(r => String(r.seat));
}

function formatResultsDate() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date();
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function populateResSeatSelect() {
  const sel = document.getElementById('res-seat-num');
  if (!sel) return;
  sel.innerHTML = '';
  const s = cachedSettings;
  for (let i = 1; i <= (s.totalSeats || 30); i++) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = 'Seat ' + i;
    sel.appendChild(o);
  }
}

function toggleResDays() {
  const t = document.getElementById('res-type').value;
  document.getElementById('res-days-group').style.display = t === 'temporary' ? 'block' : 'none';
}

async function addReservation() {
  const seat = parseInt(document.getElementById('res-seat-num').value);
  const label = document.getElementById('res-label').value.trim();
  const type = document.getElementById('res-type').value;
  const days = parseInt(document.getElementById('res-days').value) || 1;
  const errEl = document.getElementById('res-error');

  if (!label) {
    errEl.textContent = 'Please enter a label/name for this reservation.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const data = await apiRequest('/reservations', 'POST', { seat, label, type, days });

    if (data.success) {
      cachedReservations.push(data.reservation);
      errEl.style.display = 'none';
      document.getElementById('res-label').value = '';
      renderReservationsList();
      refreshAdminStats();
      showToast('Seat ' + seat + ' reserved (' + (type === 'permanent' ? 'Permanent' : days + ' day(s)') + ').', 'success');
    } else {
      errEl.textContent = data.message || 'Failed to add reservation.';
      errEl.style.display = 'block';
    }
  } catch (error) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.style.display = 'block';
  }
}

async function removeReservation(seat) {
  try {
    const data = await apiRequest('/reservations', 'DELETE', { seat });

    if (data.success) {
      cachedReservations = cachedReservations.filter(r => r.seat !== seat);
      renderReservationsList();
      refreshAdminStats();
      showToast('Reservation for Seat ' + seat + ' removed.', '');
    } else {
      showToast(data.message || 'Failed to remove reservation.', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
  }
}

function renderReservationsList() {
  const list = document.getElementById('res-list');
  const empty = document.getElementById('res-empty');
  const count = document.getElementById('res-count');
  if (!list) return;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  count.textContent = cachedReservations.length + ' reserved';

  if (!cachedReservations.length) {
    empty.style.display = 'block';
    list.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  const sorted = [...cachedReservations].sort((a, b) => a.seat - b.seat);
  list.innerHTML = '';

  sorted.forEach(r => {
    const isExpired = r.type === 'temporary' && new Date(r.expiresDate) < now;
    const div = document.createElement('div');
    div.className = 'res-item';

    let meta = '';
    if (r.type === 'permanent') {
      meta = '<span class="res-perm-badge">Permanent</span>';
    } else if (isExpired) {
      meta = '<span class="res-expired-badge">Expired ' + r.expiresDate + '</span>';
    } else {
      meta = '<span class="res-temp-badge">Until ' + r.expiresDate + '</span>';
    }

    div.innerHTML = `
      <div class="res-item-info">
        <div class="res-seat-badge">${r.seat}</div>
        <div>
          <div class="res-item-name">${r.label}</div>
          <div class="res-item-meta">${meta} &nbsp;Seat ${r.seat}</div>
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeReservation(${r.seat})">Remove</button>
    `;
    list.appendChild(div);
  });
}

// ═══════════════════════════════════════════════════════════════
// MODAL & TOAST
// ═══════════════════════════════════════════════════════════════

function openModal(title, body, buttons) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + b.cls;
    btn.textContent = b.label;
    btn.onclick = b.fn;
    footer.appendChild(btn);
  });
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showToast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3600);
}

// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════

function switchTab(id, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');

  if (id === 'tab-bookings') renderAdminBookings();
  if (id === 'tab-history') renderHistory();
  if (id === 'tab-users') renderUsersTable();
  if (id === 'tab-reservations') {
    populateResSeatSelect();
    renderReservationsList();
  }
}

// ═══════════════════════════════════════════════════════════════
// BUG 2 FIX — SEAT RESET BETWEEN ROUNDS
// ═══════════════════════════════════════════════════════════════

/**
 * Clears all temporary (per-round) seat selections from the UI and from the
 * in-memory booking cache, then re-applies only the permanently/temporarily
 * reserved seats that are still active in the database.
 *
 * Called whenever the system transitions INTO a new countdown cycle
 * (i.e. state changes TO before_open or reset).
 *
 * Rules:
 *  - Staff bookings from the previous round are removed from cachedBookings.
 *  - Reserved seats (permanent or active temporary) are preserved.
 *  - The seat grid DOM is wiped so no stale "selected" styling remains.
 */
function resetSeatSelections() {
  // 1. Wipe only the staff bookings — keep reserved-seat placeholders.
  //    cachedBookings keys are seat numbers; entries injected by reservations
  //    carry the _reserved flag set in renderSeatGrid.
  const cleaned = {};
  Object.entries(cachedBookings).forEach(([seat, info]) => {
    if (info && info._reserved) {
      // This entry was injected locally for display; it will be re-applied by
      // renderSeatGrid on the next render, so drop it here too.
      // (reserved seats are re-read from cachedReservations, not cachedBookings)
    }
    // Drop every staff booking — we only keep nothing.
    // The authoritative source is the server; refreshBookings() below will
    // repopulate cachedBookings with whatever the server holds.
  });
  cachedBookings = cleaned; // now an empty object

  // 2. Reset the seat grid DOM — remove every visual selection state.
  //    Works even if the grid is currently hidden (the HTML still exists).
  document.querySelectorAll('.seat-btn').forEach(btn => {
    btn.classList.remove('seat-mine', 'seat-taken', 'seat-available', 'seat-disabled');
    btn.classList.add('seat-disabled');
    btn.disabled = true;
    btn.onclick = null;
    // Update label to neutral dash
    const labelEl = btn.querySelector('.seat-label');
    if (labelEl) labelEl.textContent = '—';
  });

  // 3. Re-fetch fresh data from the server so reserved seats are correctly
  //    reflected on the very next renderSeatGrid call.
  //    We do not await here — this runs in the background and the next
  //    refreshDashboard() call (triggered by the state change) will use the
  //    updated cachedBookings and cachedReservations.
  refreshBookings().catch(err => console.error('resetSeatSelections: refreshBookings failed', err));
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════

let lastState = null;

async function mainLoop() {
  const now = new Date();
  const ts = now.toLocaleTimeString('en-GB');
  const dc = document.getElementById('dash-clock');
  const ac = document.getElementById('admin-clock');
  if (dc) dc.textContent = ts;
  if (ac) ac.textContent = ts;

  const state = getSystemState();

  if (document.getElementById('page-dashboard').classList.contains('active') && currentUser) {
    if (state === 'before_open' || state === 'reset' || state === 'weekend') {
      const s = cachedSettings;
      const { h, m } = parseTimeStr(s.openTime || '16:50');
      if (!cachedTestMode.active) {
        const ms = state === 'before_open' ? msToNext(h, m) : msToNextWeekdayFriday(h, m);
        const el = document.getElementById('countdown-display');
        if (el) el.textContent = formatCountdown(ms);
      }
    }
    if (state !== lastState) {
      // BUG 2 FIX — When the round ends and a new countdown begins, clear all
      // per-round seat selections so stale highlights don't bleed into the next round.
      //
      // The transition we care about is:  results → before_open | reset | weekend
      // (i.e. the system just finished showing results and is now counting down again).
      // We also handle: open → before_open (test-mode scenario where admin
      // closes booking without going through the results phase).
      const justStartedNewCycle =
        (state === 'before_open' || state === 'reset' || state === 'weekend') &&
        (lastState === 'results' || lastState === 'open' || lastState === 'reset');

      if (justStartedNewCycle) {
        // Clear stale selections BEFORE updating lastState / calling refreshDashboard
        // so the clean state is in place when the dashboard re-renders.
        resetSeatSelections();
      }

      lastState = state;
      refreshDashboard();
    } else if (state === 'open' && now.getSeconds() % 5 === 0) {
      refreshDashboard();
    }
  }

  if (document.getElementById('page-admin').classList.contains('active') && currentUser) {
    if (now.getSeconds() % 10 === 0) {
      refreshAdminStats();
      renderAdminBookings();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('page-login').classList.contains('active')) doLogin();
    if (document.getElementById('page-change-password').classList.contains('active')) doChangePassword();
  }
});

// ═══════════════════════════════════════════════════════════════
// BUG 1 FIX — SESSION RESTORE ON PAGE LOAD
// ═══════════════════════════════════════════════════════════════

/**
 * Restores a previously saved login session.
 * Called once on page load. If localStorage holds a valid user object,
 * we set currentUser and go straight to afterLogin() — skipping the
 * login page entirely, exactly as if the user had just logged in.
 *
 * @param {object} user - The plain object read from localStorage
 */
async function restoreSession(user) {
  // Rehydrate the in-memory state from the stored snapshot.
  currentUser = user;

  if (currentUser.mustChangePw) {
    // Edge-case: user refreshed while on the change-password screen.
    showPage('page-change-password');
    return;
  }

  await afterLogin();
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

setInterval(mainLoop, 1000);
mainLoop();

// BUG 1 FIX — Attempt to restore a saved session on every page load.
// If no session is found the app stays on the login page (default behaviour).
(function initSession() {
  try {
    const raw = localStorage.getItem('cobranet_user');
    if (raw) {
      const saved = JSON.parse(raw);
      // Basic sanity-check: the object must have at least a name and role.
      if (saved && saved.name && saved.role) {
        restoreSession(saved);
      }
    }
  } catch (e) {
    // Corrupt storage entry — silently ignore and stay on login page.
    localStorage.removeItem('cobranet_user');
  }
}());
