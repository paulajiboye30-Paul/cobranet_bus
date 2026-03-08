# Cobranet Staff Bus Booking System

A full-stack web application for managing staff bus seat reservations. Built with HTML, CSS, JavaScript, Node.js, MongoDB, and deployed on Vercel.

## Features

### For Staff
- **Secure Login** - Username/password authentication
- **Password Change** - Required on first login for security
- **Seat Selection** - Visual seat grid for easy booking
- **Real-time Updates** - See available/taken seats instantly
- **Booking Confirmation** - Clear confirmation of your reserved seat

### For Admin
- **Staff Management** - Add, edit, remove staff members
- **Booking Dashboard** - View all today's bookings
- **History Tracking** - Complete booking history across all dates
- **Seat Reservations** - Reserve seats permanently or temporarily
- **System Settings** - Configure booking schedule and total seats
- **Test Mode** - Simulate different booking phases for testing
- **Export Data** - Download bookings as PDF or Excel

### System Features
- **Time-based Booking Window** - Configurable open/close times
- **Double Booking Prevention** - One seat per staff member
- **Weekend Detection** - Automatic weekend closure
- **Countdown Timer** - Shows time until booking opens
- **Responsive Design** - Works on desktop and mobile

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js Serverless Functions |
| Database | MongoDB Atlas |
| Deployment | Vercel |
| PDF Export | jsPDF |
| Excel Export | SheetJS (xlsx) |

## Project Structure

```
project-root/
│
├── index.html              # Main HTML file
├── style.css               # Stylesheet
├── script.js               # Frontend JavaScript with API calls
│
├── api/                    # Vercel Serverless Functions
│   ├── login.js            # POST /api/login - Staff authentication
│   ├── bookSeat.js         # POST/GET /api/bookSeat - Seat booking
│   ├── changePassword.js   # POST /api/changePassword - Password change
│   ├── seats.js            # GET /api/seats - All seat info
│   ├── staff.js            # CRUD /api/staff - Staff management
│   ├── settings.js         # GET/POST /api/settings - System settings
│   ├── reservations.js     # CRUD /api/reservations - Seat reservations
│   ├── testMode.js         # GET/POST /api/testMode - Test mode state
│   ├── resetBookings.js    # POST /api/resetBookings - Reset today's bookings
│   └── history.js          # GET/DELETE /api/history - Booking history
│
├── package.json            # Node.js dependencies
├── vercel.json             # Vercel configuration
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  username: String,      // Unique staff username
  password: String,      // Plain text (use bcrypt in production)
  name: String,          // Full name
  role: String,          // 'staff' or 'admin'
  mustChangePw: Boolean, // Force password change on first login
  createdAt: Date,
  updatedAt: Date
}
```

### Bookings Collection
```javascript
{
  _id: ObjectId,
  seatNumber: String,    // Seat number (1-30)
  userId: ObjectId,      // Reference to user
  username: String,      // Staff username
  name: String,          // Staff full name
  date: String,          // YYYY-MM-DD format
  bookingTime: String,   // HH:MM:SS format
  createdAt: Date
}
```

### Settings Collection
```javascript
{
  openTime: String,      // HH:MM - When booking opens
  closeTime: String,     // HH:MM - When booking closes
  resultsTime: String,   // HH:MM - When results display ends
  totalSeats: Number,    // Total bus seats (default: 30)
  updatedAt: Date
}
```

### Reservations Collection
```javascript
{
  _id: 'reservations',
  data: [
    {
      seat: Number,        // Seat number
      label: String,       // Reservation label (e.g., "Driver")
      type: String,        // 'permanent' or 'temporary'
      createdDate: String, // YYYY-MM-DD
      expiresDate: String, // YYYY-MM-DD (for temporary)
      days: Number         // Duration in days (for temporary)
    }
  ]
}
```

## Default Credentials

| Username | Password | Role | Name |
|----------|----------|------|------|
| admin | admin123 | Admin | System Administrator |
| jdoe | pass123 | Staff | John Doe |
| asmith | pass123 | Staff | Alice Smith |
| bjohnson | pass123 | Staff | Bob Johnson |
| cmwangi | pass123 | Staff | Catherine Mwangi |
| dafolabi | pass123 | Staff | David Afolabi |

**Note:** Staff accounts must change their password on first login.

## Deployment Instructions

### Prerequisites
1. [GitHub](https://github.com) account
2. [Vercel](https://vercel.com) account
3. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (free tier available)

### Step 1: Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free account
2. Create a new cluster (M0 Sandbox is free)
3. Click "Connect" → "Connect your application"
4. Copy the connection string (looks like):
   ```
   mongodb+srv://username:password@cluster.mongodb.net/cobranet_bus_booking?retryWrites=true&w=majority
   ```
5. Replace `username` and `password` with your database user credentials
6. Save this connection string for later

### Step 2: Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it `cobranet-bus-booking`
3. Make it public or private (your choice)
4. Do NOT initialize with README (we already have one)

### Step 3: Upload Code to GitHub

**Option A: Using Git Command Line**
```bash
# Clone this repository or create files locally
cd cobranet-bus-booking

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Add remote (replace with your GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/cobranet-bus-booking.git

# Push
git push -u origin main
```

**Option B: Using GitHub Web Interface**
1. Go to your new GitHub repository
2. Click "uploading an existing file"
3. Drag and drop all project files
4. Click "Commit changes"

### Step 4: Deploy to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: ./ (default)
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)
5. Click "Environment Variables" and add:
   - `MONGODB_URI`: Your MongoDB connection string
   - `MONGODB_DB_NAME`: `cobranet_bus_booking`
6. Click "Deploy"

### Step 5: Verify Deployment

1. Wait for build to complete (should take 1-2 minutes)
2. Click on the deployed domain (e.g., `cobranet-bus-booking.vercel.app`)
3. Test login with default credentials
4. Verify all features work correctly

## Local Development

### Option 1: Using Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Run development server
vercel dev
```

### Option 2: Using Node.js Directly

```bash
# Install dependencies
npm install

# Set environment variables
export MONGODB_URI="your_connection_string"
export MONGODB_DB_NAME="cobranet_bus_booking"

# Start development server (requires additional setup)
```

## API Endpoints

| Endpoint | Method | Description | Request Body |
|----------|--------|-------------|--------------|
| `/api/login` | POST | Authenticate staff | `{ username, password }` |
| `/api/bookSeat` | GET | Get today's bookings | - |
| `/api/bookSeat` | POST | Book a seat | `{ seatNumber, userId, username, name }` |
| `/api/changePassword` | POST | Change password | `{ userId, newPassword }` |
| `/api/seats` | GET | Get all seat info | - |
| `/api/staff` | GET | Get all staff | - |
| `/api/staff` | POST | Add staff | `{ name, username, password, role }` |
| `/api/staff` | PUT | Update staff | `{ userId, name, role, password }` |
| `/api/staff` | DELETE | Remove staff | `{ userId }` |
| `/api/settings` | GET | Get settings | - |
| `/api/settings` | POST | Update settings | `{ openTime, closeTime, resultsTime, totalSeats }` |
| `/api/reservations` | GET | Get reservations | - |
| `/api/reservations` | POST | Add reservation | `{ seat, label, type, days }` |
| `/api/reservations` | DELETE | Remove reservation | `{ seat }` |
| `/api/testMode` | GET | Get test mode | - |
| `/api/testMode` | POST | Set test mode | `{ active, state }` |
| `/api/resetBookings` | POST | Reset bookings | - |
| `/api/history` | GET | Get history | - |
| `/api/history` | DELETE | Clear history | - |

## Customization

### Change Default Booking Times

Edit the settings in the admin panel or modify the default values in `api/login.js`:

```javascript
// Default settings
{
  openTime: '16:50',    // 4:50 PM
  closeTime: '17:00',   // 5:00 PM
  resultsTime: '17:20', // 5:20 PM
  totalSeats: 30
}
```

### Change Total Seats

1. Log in as admin
2. Go to Settings tab
3. Change "Total Seats" value
4. Click "Save Settings"

### Change Brand Colors

Edit CSS variables in `style.css`:

```css
:root {
  --brand:       #ff8210;  /* Primary orange */
  --brand-dark:  #e06800;  /* Darker orange */
  --brand-light: #ff9d40;  /* Lighter orange */
  --brand-pale:  #fff4e8;  /* Very light orange */
  --brand-border:#ffd0a0;  /* Border color */
  /* ... */
}
```

## Security Considerations

⚠️ **Important for Production:**

1. **Password Hashing**: Currently uses plain text passwords. In production, use bcrypt:
   ```javascript
   const bcrypt = require('bcrypt');
   const hashedPassword = await bcrypt.hash(password, 10);
   const isValid = await bcrypt.compare(password, hashedPassword);
   ```

2. **JWT Authentication**: Add JWT tokens for session management
3. **Rate Limiting**: Implement rate limiting on login endpoint
4. **Input Validation**: Add more comprehensive input validation
5. **HTTPS**: Vercel provides HTTPS by default

## Troubleshooting

### MongoDB Connection Issues

**Error**: `MONGODB_URI environment variable is not set`
- Solution: Add `MONGODB_URI` to Vercel environment variables

**Error**: `MongoNetworkError` or connection timeout
- Solution: Whitelist all IP addresses (0.0.0.0/0) in MongoDB Atlas Network Access

### API 404 Errors

**Error**: `404 Not Found` on API endpoints
- Solution: Verify `vercel.json` routes are configured correctly
- Redeploy after making changes

### CORS Errors

**Error**: `CORS policy: No 'Access-Control-Allow-Origin' header`
- Solution: API functions already include CORS headers. Check if API is deployed correctly.

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review Vercel logs in the dashboard
3. Check MongoDB Atlas connection logs

## License

MIT License - Feel free to use and modify for your organization.

---

**Cobranet Limited** - Staff Bus Booking System v1.0.0
