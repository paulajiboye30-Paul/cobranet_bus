# Cobranet Bus Booking - Deployment Guide

This guide will help you fix the environment variable error and successfully deploy to Vercel.

## The Problem

The error message:
```
Environment variable 'MONGODB_URL references secret 'mongodb_url' which does not exist
```

This happens because:
1. The original `vercel.json` referenced secrets that don't exist
2. The code expected `MONGODB_URI` but you created `Mongodb_url`

## The Solution

I've updated all the code to:
1. **Removed secret references** from `vercel.json` - now it just uses plain environment variables
2. **Added support for both** `MONGODB_URI` and `MONGODB_URL` in all API files
3. **Updated documentation** to be clearer

## Step-by-Step Deployment

### Step 1: Update Your MongoDB Connection String

Your current connection string:
```
mongodb+srv://paulajiboye30_db_user:66yOknJ4CwCnBduc@cluster0.c8oexgp.mongodb.net/?appName=Cluster0
```

**IMPORTANT**: Add the database name to the end:
```
mongodb+srv://paulajiboye30_db_user:66yOknJ4CwCnBduc@cluster0.c8oexgp.mongodb.net/cobranet_bus_booking?retryWrites=true&w=majority
```

Notice the `/cobranet_bus_booking` added before `?retryWrites=true`

### Step 2: Update Your GitHub Repository

Upload all the updated files to your GitHub repository:

```bash
# If you have git set up
git add .
git commit -m "Fix environment variable configuration"
git push origin main
```

Or manually upload the files through GitHub web interface.

### Step 3: Configure Environment Variables in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

| Name | Value |
|------|-------|
| `MONGODB_URI` | `mongodb+srv://paulajiboye30_db_user:66yOknJ4CwCnBduc@cluster0.c8oexgp.mongodb.net/cobranet_bus_booking?retryWrites=true&w=majority` |
| `MONGODB_DB_NAME` | `cobranet_bus_booking` |

5. Click **Save**

### Step 4: Redeploy

1. In Vercel Dashboard, go to your project
2. Click on **Deployments** tab
3. Find the latest deployment and click the **...** menu
4. Select **Redeploy**

OR push a new commit to trigger automatic deployment.

### Step 5: Verify MongoDB Atlas Configuration

Make sure your MongoDB Atlas cluster allows connections from Vercel:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Select your cluster
3. Click **Network Access** in the left sidebar
4. Click **Add IP Address**
5. Select **Allow Access from Anywhere** (adds `0.0.0.0/0`)
6. Click **Confirm**

This is necessary because Vercel uses dynamic IP addresses.

## Troubleshooting

### Error: "MONGODB_URI environment variable is not set"

**Solution**: Make sure the environment variable is set in Vercel:
1. Go to Project Settings → Environment Variables
2. Verify `MONGODB_URI` exists with the correct value
3. Redeploy the project

### Error: "MongoNetworkError: connection refused"

**Solution**: Whitelist all IP addresses in MongoDB Atlas:
1. Go to MongoDB Atlas → Network Access
2. Add `0.0.0.0/0` to allow connections from anywhere

### Error: "Authentication failed"

**Solution**: Check your MongoDB credentials:
1. Verify username and password in the connection string
2. Make sure the database user exists in MongoDB Atlas
3. Reset password if necessary

### Error: "Cannot find module 'mongodb'"

**Solution**: Make sure `package.json` includes the mongodb dependency and run:
```bash
npm install
```

## Alternative: Using Vercel CLI

If you prefer using the command line:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Set environment variables
vercel env add MONGODB_URI
# Enter your connection string when prompted

vercel env add MONGODB_DB_NAME
# Enter: cobranet_bus_booking

# Deploy
vercel --prod
```

## Testing Your Deployment

After successful deployment:

1. Visit your deployed URL (e.g., `https://your-project.vercel.app`)
2. Try logging in with:
   - Username: `admin`
   - Password: `admin123`
3. You should see the Admin Dashboard

## Default Login Credentials

| Username | Password | Role | Notes |
|----------|----------|------|-------|
| admin | admin123 | Admin | Full access |
| jdoe | pass123 | Staff | Must change password on first login |
| asmith | pass123 | Staff | Must change password on first login |
| bjohnson | pass123 | Staff | Must change password on first login |
| cmwangi | pass123 | Staff | Must change password on first login |
| dafolabi | pass123 | Staff | Must change password on first login |

## Need Help?

If you're still having issues:

1. Check Vercel Function Logs:
   - Go to your project in Vercel
   - Click on a deployment
   - Go to **Functions** tab
   - Look for error messages

2. Verify your connection string works:
   ```bash
   # Test with MongoDB Compass or mongosh
   mongosh "mongodb+srv://paulajiboye30_db_user:66yOknJ4CwCnBduc@cluster0.c8oexgp.mongodb.net/cobranet_bus_booking"
   ```

3. Make sure all files are uploaded correctly to GitHub
