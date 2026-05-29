const cloudinary = require('cloudinary').v2;

// Configure from CLOUDINARY_URL environment variable
cloudinary.config();

module.exports = cloudinary;