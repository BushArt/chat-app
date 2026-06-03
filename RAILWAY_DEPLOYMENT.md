# Railway Deployment Guide

## Problem: Data Disappearing on Redeploy

When deploying to Railway, accounts and messages disappear because:
- **Ephemeral File System**: Railway doesn't persist local files between deployments
- **MongoDB**: Without a persistent MongoDB service, data is lost on each redeploy

## Solution: Configure MongoDB on Railway

### Step 1: Add MongoDB Service to Railway

1. Go to your Railway project dashboard: https://railway.app/
2. Click **"+ Add Service"** or **"Add"**
3. Select **"MongoDB"** from the marketplace
4. This creates a MongoDB instance and automatically sets the `MONGODB_URI` environment variable

### Step 2: Verify Environment Variables

Railway automatically sets `MONGODB_URI` for MongoDB, but check these are all configured:

1. In Railway dashboard → your project → Variables tab:
   - **MONGODB_URI** - Auto-set by MongoDB service (should start with `mongodb+srv://`)
   - **JWT_SECRET** - Set to a random string (e.g., `openssl rand -hex 32`)
   - **CLOUDINARY_URL** - Get from your Cloudinary account (starts with `cloudinary://`)
   - **NODE_ENV** - Set to `production`
   - **PORT** - Should be auto-set, but ensure it's `3000` or leave blank for Railway default

### Step 3: Link Services

If MongoDB was added separately:
1. In Railway dashboard, click your Node.js service
2. Go to the **"Variables"** tab
3. Click **"+ Add Reference"** 
4. Add `MONGODB_URI` from the MongoDB service

### Step 4: Redeploy

```bash
git push origin main
# This triggers Railway to redeploy with MongoDB connected
```

## Verification

After deploying with MongoDB:
1. Register a new account
2. Upload a file
3. Reload the page - **account and files should still be there**
4. Redeploy the app - **data should persist**

## Common Issues

| Problem | Solution |
|---------|----------|
| "Cannot connect to database" | Check MONGODB_URI is set in Railway Variables |
| "Invalid environment variable" | Ensure CLOUDINARY_URL format: `cloudinary://key:secret@cloud` |
| "Data lost after redeploy" | Add MongoDB service (see Step 1) |
| "403 Unauthorized on downloads" | ✓ Fixed in latest version - no auth needed |

## Environment Variable Format Reference

- **JWT_SECRET**: Random 32+ character string
- **CLOUDINARY_URL**: `cloudinary://your_key:your_secret@your_cloud_name`
- **MONGODB_URI**: Auto-set by Railway MongoDB service (format: `mongodb+srv://user:pass@cluster.mongodb.net/database`)

## Local Testing (Before Railway Deploy)

Test with local MongoDB:
```bash
# Start local MongoDB (or use MongoDB Atlas)
export MONGODB_URI="mongodb://localhost:27017/chat-app"
export JWT_SECRET="test-secret-key"
export CLOUDINARY_URL="cloudinary://..."
npm start
```

## Need Help?

- MongoDB service on Railway: https://railway.app/
- Cloudinary account: https://cloudinary.com/
- Railway docs: https://docs.railway.app/
